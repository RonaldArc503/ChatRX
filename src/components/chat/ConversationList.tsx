import type { ChatConversation } from "../../lib/chat";
import { Avatar } from "./Avatar";
import { formatTime } from "./time";

interface ConversationListProps {
  conversations: ChatConversation[];
  uid: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function peerOf(
  conv: ChatConversation,
  uid: string,
): { uid: string; name: string; photoURL: string; phone: string; isSelf: boolean } {
  const otherId = conv.participantIds.find((id) => id !== uid);
  if (!otherId) {
    const id = conv.participantIds[0] ?? "";
    const ownMember = conv.members[id];
    return {
      uid: id,
      name: "Mensajes guardados",
      photoURL: ownMember?.photoURL || "",
      phone: "",
      isSelf: true,
    };
  }
  const member = conv.members[otherId];
  return {
    uid: otherId,
    name: member?.displayName || "Usuario",
    photoURL: member?.photoURL || "",
    phone: member?.phone || "",
    isSelf: false,
  };
}

export function ConversationList({
  conversations,
  uid,
  selectedId,
  onSelect,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <span class="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-7 w-7">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <div>
          <p class="text-sm font-semibold text-slate-700">Sin conversaciones</p>
          <p class="mt-1 text-xs text-slate-500">
            Toca el lápiz arriba para contactar a alguien.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul class="flex-1 overflow-y-auto">
      {conversations.map((conv) => {
        const peer = peerOf(conv, uid);
        const unread = conv.unread?.[uid] ?? 0;
        const active = conv.id === selectedId;
        return (
          <li key={conv.id}>
            <button
              type="button"
              class={
                "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors " +
                (active ? "bg-indigo-50" : "hover:bg-slate-50")
              }
              onClick={() => onSelect(conv.id)}
            >
              <Avatar uid={peer.uid} name={peer.name} photoURL={peer.photoURL} size="sm" />
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline justify-between gap-2">
                  <span class="truncate text-sm font-semibold text-slate-800">
                    {peer.name}
                  </span>
                  <span class="flex-none text-[11px] text-slate-400">
                    {formatTime(conv.lastMessageAt)}
                  </span>
                </span>
                <span class="mt-0.5 flex items-center justify-between gap-2">
                  <span
                    class={
                      "truncate text-xs " +
                      (unread > 0 ? "font-semibold text-slate-700" : "text-slate-500")
                    }
                  >
                    {peer.isSelf
                      ? "Escríbete a ti mismo. Guarda notas y enlaces."
                      : conv.lastMessageAt
                        ? conv.lastMessage
                        : "Nuevo chat"}
                  </span>
                  {unread > 0 ? (
                    <span class="grid h-5 min-w-5 flex-none place-items-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-bold text-white">
                      {unread}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}