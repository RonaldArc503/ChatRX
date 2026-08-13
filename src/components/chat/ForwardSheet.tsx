import { useState } from "preact/hooks";
import {
  sendMessage,
  type ChatConversation,
  type ChatMessage,
  type ForwardedFrom,
} from "../../lib/chat";
import type { UserProfile } from "../../lib/profile";
import { Avatar } from "./Avatar";
import { AvatarStack } from "./AvatarStack";
import { peerOf } from "./ConversationList";
import { extractMentions } from "./mention";

interface ForwardSheetProps {
  me: UserProfile;
  msg: ChatMessage;
  forwardedFrom: ForwardedFrom;
  conversations: ChatConversation[];
  currentConvId: string;
  onClose: () => void;
  onSent: () => void;
}

export function ForwardSheet({
  me,
  msg,
  forwardedFrom,
  conversations,
  currentConvId,
  onClose,
  onSent,
}: ForwardSheetProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = conversations.filter((c) => c.id !== currentConvId);
  const attachmentCount = msg.attachments?.length ?? 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (sending || selected.size === 0) return;
    setSending(true);
    setError(null);
    try {
      for (const id of selected) {
        const conv = conversations.find((c) => c.id === id);
        const mentions = conv?.kind === "group" ? extractMentions(msg.text, conv.members ?? {}) : [];
        await sendMessage(
          id,
          me.uid,
          msg.text,
          null,
          msg.attachments,
          mentions,
          forwardedFrom,
        );
      }
      onSent();
      onClose();
    } catch (err) {
      setSending(false);
      setError(err instanceof Error ? err.message : "No se pudo reenviar.");
    }
  }

  return (
    <div class="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      <div
        class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div class="absolute inset-x-0 bottom-0 flex justify-center">
        <div class="animate-sheet-in flex max-h-[75dvh] w-full max-w-md flex-col rounded-t-2xl bg-white p-2 pb-4 shadow-2xl dark:bg-slate-900">
          <div class="flex items-center justify-between gap-2 border-b border-slate-100 px-3 pb-3 pt-2 dark:border-slate-800">
            <p class="min-w-0 text-sm font-bold text-slate-800 dark:text-slate-100">
              Reenviar a…
            </p>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              class="grid h-8 w-8 flex-none place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <div class="mx-3 mt-2 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
            <span class="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {msg.text.trim() || (attachmentCount > 0 ? `📎 ${attachmentCount} adjunto(s)` : "")}
            </span>
          </div>

          <ul class="min-h-0 flex-1 overflow-y-auto py-2">
            {targets.length === 0 ? (
              <li class="px-4 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                No hay otros chats para reenviar.
              </li>
            ) : (
              targets.map((conv) => {
                const peer = peerOf(conv, me.uid);
                const memberList = Object.entries(conv.members ?? {}).map(([mUid, m]) => ({
                  uid: mUid,
                  displayName: m.displayName,
                  photoURL: m.photoURL,
                }));
                const isSelected = selected.has(conv.id);
                return (
                  <li key={conv.id}>
                    <button
                      type="button"
                      class={
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors " +
                        (isSelected ? "bg-indigo-50 dark:bg-indigo-500/15" : "hover:bg-slate-50 dark:hover:bg-slate-800/60")
                      }
                      onClick={() => toggle(conv.id)}
                    >
                      <span class="flex-none">
                        {peer.isGroup ? (
                          <AvatarStack members={memberList} size="sm" />
                        ) : (
                          <Avatar uid={peer.uid} name={peer.name} photoURL={peer.photoURL} size="sm" />
                        )}
                      </span>
                      <span class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {peer.name}
                      </span>
                      <span
                        class={
                          "grid h-6 w-6 flex-none place-items-center rounded-full border-2 transition-colors " +
                          (isSelected
                            ? "border-indigo-600 bg-indigo-600 text-white"
                            : "border-slate-300 text-transparent dark:border-slate-600")
                        }
                        aria-hidden="true"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" class="h-3.5 w-3.5">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {error ? (
            <p class="border-t border-red-100 px-4 py-2 text-xs text-red-600 dark:border-red-500/20 dark:text-red-400">
              {error}
            </p>
          ) : null}

          <div class="flex gap-2 px-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              class="flex-none rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={sending || selected.size === 0}
              onClick={handleSend}
              class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-40"
            >
              {sending ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4 animate-spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Enviando…
                </>
              ) : (
                <>Reenviar a {selected.size > 0 ? `(${selected.size})` : ""}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}