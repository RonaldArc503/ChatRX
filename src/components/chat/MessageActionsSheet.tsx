import { useState } from "preact/hooks";
import type { ChatMessage } from "../../lib/chat";

interface MessageActionsSheetProps {
  msg: ChatMessage | null;
  mine: boolean;
  uid?: string;
  isPinned: boolean;
  onClose: () => void;
  onEdit: (msg: ChatMessage) => void;
  onDelete: (msg: ChatMessage) => void;
  onReply: (msg: ChatMessage) => void;
  onReact: (msg: ChatMessage, emoji: string) => void;
  onPin: (msg: ChatMessage) => void;
}

const REACT_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const REPLY_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
    <path d="m3 11 9-9v5c6 1 9 5 9 11-2-4-5-5-9-5v5Z" />
  </svg>
);

const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const EDIT_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);

const DELETE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m9 11 3 3L22 4" />
  </svg>
);

const DOWNLOAD_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);

const PIN_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z" />
  </svg>
);

async function downloadAttachment(url: string, name: string): Promise<void> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function MessageActionsSheet({
  msg,
  mine,
  uid,
  isPinned,
  onClose,
  onEdit,
  onDelete,
  onReply,
  onReact,
  onPin,
}: MessageActionsSheetProps) {
  const [copied, setCopied] = useState(false);

  if (!msg) return null;

  const myReaction = uid ? msg.reactions?.[uid] : undefined;
  const attachments = msg.attachments ?? [];

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(msg!.text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = msg!.text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
      onClose();
    }, 900);
  }

  return (
    <div class="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      <div
        class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div class="absolute inset-x-0 bottom-0 flex justify-center">
        <div class="animate-sheet-in w-full max-w-md rounded-t-2xl bg-white p-2 pb-4 shadow-2xl dark:bg-slate-900">
          <div class="flex items-center justify-center gap-1 border-b border-slate-100 px-2 pb-3 pt-1 dark:border-slate-800">
            {REACT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Reaccionar con ${emoji}`}
                class={
                  "grid h-11 w-11 place-items-center rounded-full text-2xl transition-transform active:scale-90 " +
                  (emoji === myReaction
                    ? "bg-indigo-100 ring-2 ring-indigo-300 dark:bg-indigo-500/25 dark:ring-indigo-400"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800")
                }
                onClick={() => onReact(msg, emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>

          {msg.text.trim() ? (
            <p class="truncate px-3 pb-2 pt-2 text-sm text-slate-400 dark:text-slate-500">
              “{msg.text.trim()}”
            </p>
          ) : null}

          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => onReply(msg)}
          >
            <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
              {REPLY_ICON}
            </span>
            Responder
          </button>

          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => onPin(msg)}
          >
            <span
              class={
                "grid h-9 w-9 flex-none place-items-center rounded-full " +
                (isPinned
                  ? "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300")
              }
            >
              {PIN_ICON}
            </span>
            {isPinned ? "Desfijar mensaje" : "Fijar mensaje"}
          </button>

          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={handleCopy}
          >
            <span
              class={
                "grid h-9 w-9 flex-none place-items-center rounded-full " +
                (copied
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400")
              }
            >
              {copied ? CHECK_ICON : COPY_ICON}
            </span>
            {copied ? "Copiado" : "Copiar Mensaje"}
          </button>

          {attachments.length > 0 ? (
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => {
                attachments.forEach((a) => downloadAttachment(a.url, a.name));
                onClose();
              }}
            >
              <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                {DOWNLOAD_ICON}
              </span>
              Descargar archivos
            </button>
          ) : null}

          {mine ? (
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => {
                onEdit(msg);
              }}
            >
              <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
                {EDIT_ICON}
              </span>
              Editar mensaje
            </button>
          ) : null}

          {mine ? (
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              onClick={() => {
                onDelete(msg);
              }}
            >
              <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                {DELETE_ICON}
              </span>
              Eliminar Mensaje
            </button>
          ) : null}

          <button
            type="button"
            class="mt-1 w-full rounded-xl bg-slate-100 px-3 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}