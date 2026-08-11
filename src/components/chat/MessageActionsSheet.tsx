import { useState } from "preact/hooks";
import type { ChatMessage } from "../../lib/chat";

interface MessageActionsSheetProps {
  msg: ChatMessage | null;
  mine: boolean;
  onClose: () => void;
  onEdit: (msg: ChatMessage) => void;
  onDelete: (msg: ChatMessage) => void;
}

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

export function MessageActionsSheet({
  msg,
  mine,
  onClose,
  onEdit,
  onDelete,
}: MessageActionsSheetProps) {
  const [copied, setCopied] = useState(false);

  if (!msg) return null;

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
        <div class="animate-sheet-in w-full max-w-md rounded-t-2xl bg-white p-2 pb-4 shadow-2xl">
          {msg.text.trim() ? (
            <p class="truncate px-3 pb-2 pt-1 text-sm text-slate-400">
              “{msg.text.trim()}”
            </p>
          ) : null}

          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            onClick={handleCopy}
          >
            <span
              class={
                "grid h-9 w-9 flex-none place-items-center rounded-full " +
                (copied ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600")
              }
            >
              {copied ? CHECK_ICON : COPY_ICON}
            </span>
            {copied ? "Copiado" : "Copiar Mensaje"}
          </button>

          {mine ? (
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              onClick={() => {
                onEdit(msg);
              }}
            >
              <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-sky-50 text-sky-600">
                {EDIT_ICON}
              </span>
              Editar mensaje
            </button>
          ) : null}

          {mine ? (
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
              onClick={() => {
                onDelete(msg);
              }}
            >
              <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-red-50 text-red-600">
                {DELETE_ICON}
              </span>
              Eliminar Mensaje
            </button>
          ) : null}

          <button
            type="button"
            class="mt-1 w-full rounded-xl bg-slate-100 px-3 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200"
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}