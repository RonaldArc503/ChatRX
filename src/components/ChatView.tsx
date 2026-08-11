import { useEffect, useState } from "preact/hooks";
import type { User } from "firebase/auth";
import {
  conversationId,
  ensureSelfConversation,
  getOrCreateConversation,
  subscribeConversations,
  type ChatConversation,
} from "../lib/chat";
import { getProfile, type UserProfile } from "../lib/profile";
import { ConversationList } from "./chat/ConversationList";
import { ConversationWindow } from "./chat/ConversationWindow";
import { NewChatSearch } from "./chat/NewChatSearch";

interface ChatViewProps {
  user: User;
}

export function ChatView({ user }: ChatViewProps) {
  const [me, setMe] = useState<UserProfile | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);

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

  async function handlePick(peer: UserProfile) {
    if (!me) return;
    const id = await getOrCreateConversation(me, peer);
    if (!id) return;
    setShowNewChat(false);
    setSelectedId(id);
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

  const handleSelect = async (id: string) => {
    if (id === selfId && !hasSelf) {
      await ensureSelfConversation(me).catch(() => {});
    }
    setSelectedId(id);
  };

  return (
    <div class="fixed inset-x-0 top-0 z-30 flex h-[calc(100dvh-var(--nav-h))] min-h-0 flex-col overflow-hidden bg-white lg:static lg:z-auto lg:h-[calc(100vh-7rem)] lg:flex-row lg:rounded-2xl lg:border lg:border-slate-200 lg:shadow-sm">
      <aside
        class={
          "min-h-0 flex-col bg-white lg:w-80 lg:max-w-xs lg:shrink-0 lg:border-r lg:border-slate-200 " +
          (panelOpen ? "hidden lg:flex" : "flex")
        }
      >
        {showNewChat ? (
          <NewChatSearch
            me={me}
            onPick={handlePick}
            onCancel={() => setShowNewChat(false)}
          />
        ) : (
          <>
            <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 class="text-lg font-bold text-slate-900">Mensajes</h2>
              <button
                type="button"
                aria-label="Nueva conversación"
                onClick={() => setShowNewChat(true)}
                class="grid h-9 w-9 place-items-center rounded-full bg-indigo-600 text-white shadow-sm transition-colors hover:bg-indigo-700"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </div>
            <ConversationList
              conversations={listConversations}
              uid={user.uid}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          </>
        )}
      </aside>

      <section
        class={
"min-h-0 flex-col overflow-hidden bg-slate-50 " +
            (panelOpen
              ? "absolute inset-0 z-40 flex lg:static lg:z-auto"
              : "hidden lg:flex lg:flex-1 lg:items-center lg:justify-center")
        }
      >
        {selectedConv ? (
          <ConversationWindow
            me={me}
            conv={selectedConv}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div class="flex flex-col items-center gap-3 px-8 text-center">
            <span class="grid h-16 w-16 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-8 w-8">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <div>
              <p class="text-sm font-semibold text-slate-700">
                Selecciona una conversación
              </p>
              <p class="mt-1 text-xs text-slate-500">
                O inicia una nueva con alguna de tus contactos.
              </p>
            </div>
            {!showNewChat ? (
              <button
                type="button"
                onClick={() => setShowNewChat(true)}
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