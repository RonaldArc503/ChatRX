import { useEffect, useState } from "preact/hooks";
import type { User } from "firebase/auth";
import {
  conversationId,
  createGroup,
  ensureSelfConversation,
  getOrCreateConversation,
  subscribeConversations,
  type ChatConversation,
} from "../lib/chat";
import { getProfile, type UserProfile } from "../lib/profile";
import { subscribePresence, type Presence } from "../lib/presence";
import { ConversationList, peerOf } from "./chat/ConversationList";
import { ConversationWindow } from "./chat/ConversationWindow";
import { GroupCreateFlow } from "./chat/GroupCreateFlow";
import { NewChatSearch } from "./chat/NewChatSearch";
import { useChatSidebar } from "./chat/useChatSidebar";

interface ChatViewProps {
  user: User;
  targetId?: string | null;
  onConsumeTarget?: () => void;
}

export function ChatView({ user, targetId, onConsumeTarget }: ChatViewProps) {
  const [me, setMe] = useState<UserProfile | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const sidebar = useChatSidebar();

  function openNewChat() {
    sidebar.expand();
    setShowNewChat(true);
  }

  function openNewGroup() {
    sidebar.expand();
    setShowNewGroup(true);
  }

  useEffect(() => {
    if (!targetId) return;
    setSelectedId(targetId);
    onConsumeTarget?.();
  }, [targetId]);

  useEffect(() => {
    getProfile(user.uid)
      .then((p) => {
        if (p) setMe(p);
      })
      .catch(() => {});
  }, [user.uid]);

  useEffect(() => {
    if (!me) return;
    ensureSelfConversation(me).catch(() => {});
  }, [me?.uid]);

  useEffect(() => {
    return subscribeConversations(user.uid, setConversations);
  }, [user.uid]);

  const peerKey = conversations
    .flatMap((c) => c.participantIds.filter((id) => id !== user.uid))
    .sort()
    .join(",");

  useEffect(() => {
    if (!me) return;
    const peers = new Set(
      conversations.flatMap((c) =>
        c.participantIds.filter((id) => id !== user.uid),
      ),
    );
    const subs = [...peers].map((pid) =>
      subscribePresence(pid, (p) => {
        setPresence((prev) => ({
          ...prev,
          [pid]: p ?? { online: false, lastSeen: 0 },
        }));
      }),
    );
    return () => {
      subs.forEach((unsub) => unsub());
    };
  }, [peerKey, me?.uid, user.uid]);

  async function handlePick(peer: UserProfile) {
    if (!me) return;
    try {
      const id = await getOrCreateConversation(me, peer);
      if (!id) return;
      setShowNewChat(false);
      setSelectedId(id);
    } catch (error) {
      console.error("Error al iniciar la conversación:", error);
    }
  }

  async function handleCreateGroup(name: string, members: UserProfile[]) {
    if (!me) return;
    try {
      const id = await createGroup(me, name, members);
      if (!id) return;
      setShowNewGroup(false);
      setSelectedId(id);
    } catch (error) {
      console.error("Error al crear el grupo:", error);
    }
  }

  if (!me) {
    return (
      <div class="flex min-h-60 items-center justify-center">
        <span
          class="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
          role="status"
          aria-label="Cargando chat"
        />
      </div>
    );
  }

  const selfId = conversationId(user.uid, user.uid);
  const hasSelf = conversations.some((c) => c.id === selfId);
  const listConversations: ChatConversation[] = hasSelf
    ? conversations
    : [
        {
          id: selfId,
          participantIds: [user.uid],
          members: {
            [user.uid]: {
              displayName: me.displayName,
              photoURL: me.photoURL,
              phone: me.phone,
            },
          },
          unread: { [user.uid]: 0 },
          lastMessage: "",
          lastMessageAt: 0,
          createdAt: 0,
        },
        ...conversations,
      ];

  const selectedConv =
    listConversations.find((c) => c.id === selectedId) ?? null;
  const panelOpen = selectedConv !== null;
  const selectedPeer = selectedConv ? peerOf(selectedConv, user.uid) : null;
  const peerPresence = selectedPeer
    ? presence[selectedPeer.uid] ?? null
    : null;

  const handleSelect = async (id: string) => {
    if (id === selfId && !hasSelf) {
      await ensureSelfConversation(me).catch(() => {});
    }
    setSelectedId(id);
  };

  return (
    <div class="fixed inset-x-0 top-[var(--audio-bar-h)] z-[45] flex h-[calc(100dvh-var(--nav-h)-var(--audio-bar-h))] min-h-0 flex-col overflow-hidden bg-white dark:bg-slate-900 lg:left-[var(--app-rail-w)] lg:flex-row">
      <aside
        id="chat-sidebar"
        aria-label="Conversaciones"
        data-collapsed={sidebar.collapsed ? "true" : "false"}
        style={{ "--chat-sidebar-width": `${sidebar.width}px` }}
        class={
          "chat-sidebar relative min-h-0 flex-col bg-white dark:bg-slate-900 lg:shrink-0 lg:border-r lg:border-slate-200 lg:dark:border-slate-800 " +
          (panelOpen ? "hidden lg:flex" : "flex")
        }
      >
        {showNewGroup ? (
          <GroupCreateFlow
            me={me}
            onPick={handleCreateGroup}
            onCancel={() => setShowNewGroup(false)}
          />
        ) : showNewChat ? (
          <NewChatSearch
            me={me}
            onPick={handlePick}
            onCancel={() => setShowNewChat(false)}
          />
        ) : (
          <>
            <div class="chat-sidebar-header flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:min-h-[88px]">
              <h2 class="chat-sidebar-details text-lg font-bold text-slate-900 dark:text-white lg:text-2xl">Mensajes</h2>
              <div class="chat-sidebar-actions flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={sidebar.collapsed ? "Expandir lista de chats" : "Contraer lista de chats"}
                  title={sidebar.collapsed ? "Expandir lista de chats" : "Contraer lista de chats"}
                  aria-controls="chat-sidebar"
                  aria-expanded={!sidebar.collapsed}
                  onClick={sidebar.toggle}
                  class="hidden h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-300 dark:hover:bg-indigo-500/15 lg:grid"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M9 4v16" />
                    <path d={sidebar.collapsed ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"} />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Nuevo grupo"
                  title="Nuevo grupo"
                  onClick={openNewGroup}
                  class="grid h-9 w-9 place-items-center rounded-full bg-transparent text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-400"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Nueva conversación"
                  title="Nueva conversación"
                  onClick={openNewChat}
                  class="grid h-9 w-9 place-items-center rounded-full bg-indigo-600 text-white shadow-sm transition-colors hover:bg-indigo-700"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
              </div>
            </div>
            <ConversationList
              conversations={listConversations}
              uid={user.uid}
              selectedId={selectedId}
              onSelect={handleSelect}
              presence={presence}
            />
          </>
        )}
        {!showNewChat && !showNewGroup ? (
          <div
            {...sidebar.separatorProps}
            role="separator"
            tabIndex={0}
            aria-label="Ancho de la lista de chats"
            aria-controls="chat-sidebar"
            aria-orientation="vertical"
            aria-valuemin={80}
            aria-valuemax={sidebar.maxWidth}
            aria-valuenow={sidebar.width}
            aria-valuetext={sidebar.collapsed ? "Solo avatares" : `${sidebar.width} píxeles`}
            title="Arrastra para ajustar el ancho. Doble clic para contraer o expandir."
            class={"absolute inset-y-0 -right-1 z-50 hidden w-2 cursor-col-resize touch-none items-center justify-center outline-none hover:bg-indigo-500/15 focus-visible:bg-indigo-500/20 lg:flex " + (sidebar.resizing ? "bg-indigo-500/20" : "")}
          >
            <span aria-hidden="true" class="h-10 w-0.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>
        ) : null}
      </aside>

      <section
        class={
          "min-h-0 min-w-0 flex-col overflow-hidden bg-slate-50 dark:bg-slate-900 " +
            (panelOpen
              ? "absolute inset-0 z-40 flex lg:static lg:z-auto lg:flex-1"
              : "hidden lg:flex lg:flex-1 lg:items-center lg:justify-center")
        }
      >
        {selectedConv ? (
          <ConversationWindow
            me={me}
            conv={selectedConv}
            peerPresence={peerPresence}
            conversations={listConversations}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div class="flex flex-col items-center gap-3 px-8 text-center">
            <span class="grid h-16 w-16 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-8 w-8">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <div>
              <p class="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Selecciona una conversación
              </p>
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                O inicia una nueva con alguna de tus contactos.
              </p>
            </div>
            {!showNewChat ? (
              <button
                type="button"
                onClick={openNewChat}
                class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
              >
                Nueva conversación
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
