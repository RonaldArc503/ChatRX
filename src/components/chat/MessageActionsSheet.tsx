import type { KeyboardEventHandler } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ChatMessage } from "../../lib/chat";

export interface MessageMenuAnchor {
  x: number;
  y: number;
  align?: "start" | "end";
}

interface MessageActionsSheetProps {
  msg: ChatMessage | null;
  mine: boolean;
  uid?: string;
  isPinned: boolean;
  desktop?: boolean;
  anchor?: MessageMenuAnchor | null;
  onClose: () => void;
  onEdit: (msg: ChatMessage) => void;
  onDelete: (msg: ChatMessage) => void;
  onDeleteForMe?: (msg: ChatMessage) => void;
  onReply: (msg: ChatMessage) => void;
  onReact: (msg: ChatMessage, emoji: string) => void;
  onPin: (msg: ChatMessage) => void;
  onForward: (msg: ChatMessage) => void;
  onSave: (msg: ChatMessage) => void;
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

const FORWARD_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
    <path d="m4 12 10-8" />
    <path d="m14 4 6 8-6 8Z" />
    <path d="M4 12h16" />
  </svg>
);

const SAVE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <path d="M17 21v-8H7v8" />
    <path d="M7 3v5h8" />
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

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    img.src = url;
  });
}

async function copyImageToClipboard(url: string): Promise<void> {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo copiar la imagen.");
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/png"),
  );
  if (!blob) throw new Error("No se pudo copiar la imagen.");
  if (!navigator.clipboard || !("write" in navigator.clipboard)) {
    throw new Error("No se pudo copiar la imagen.");
  }
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob }),
  ]);
}

export function MessageActionsSheet({
  msg,
  mine,
  uid,
  isPinned,
  desktop = false,
  anchor,
  onClose,
  onEdit,
  onDelete,
  onDeleteForMe,
  onReply,
  onReact,
  onPin,
  onForward,
  onSave,
}: MessageActionsSheetProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    if (!msg) return;
    setCopied(false);
    setCopyFailed(false);
    const panel = panelRef.current;
    if (!panel) return;
    const previousFocus = document.activeElement;
    const placeMenu = () => {
      if (!desktop) return;
      const margin = 12;
      const { width, height } = panel.getBoundingClientRect();
      const point = anchor ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const left = point.align === "end" ? point.x - width : point.x;
      const top = point.y + height > window.innerHeight - margin ? point.y - height : point.y;
      setPosition({
        left: Math.max(margin, Math.min(left, window.innerWidth - width - margin)),
        top: Math.max(margin, Math.min(top, window.innerHeight - height - margin)),
      });
    };
    placeMenu();
    if (desktop) panel.querySelector<HTMLButtonElement>('button[role="menuitem"]')?.focus({ preventScroll: true });
    window.addEventListener("resize", placeMenu);
    const observer = desktop ? new ResizeObserver(placeMenu) : null;
    observer?.observe(panel);
    return () => {
      window.removeEventListener("resize", placeMenu);
      observer?.disconnect();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected &&
          (document.activeElement === document.body || panel.contains(document.activeElement))) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [msg?.id, desktop, anchor]);

  useEffect(() => {
    if (!msg) return;
    const outside = (event: PointerEvent) => {
      if (desktop && event.target instanceof Node && !panelRef.current?.contains(event.target)) closeRef.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeRef.current();
    };
    const scroll = (event: Event) => {
      if (desktop && event.target instanceof Node && !panelRef.current?.contains(event.target)) closeRef.current();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [msg?.id, desktop]);

  const handleMenuKeys: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (!desktop) return;
    if (event.key === "Tab") {
      closeRef.current();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)')];
    const current = buttons.findIndex((button) => button === document.activeElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
      (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  };

  if (!msg) return null;

  const myReaction = uid ? msg.reactions?.[uid] : undefined;
  const attachments = msg.attachments ?? [];
  const hasText = msg.text.trim().length > 0;
  const imageAttachments = attachments.filter((a) => a.kind === "image");
  const canCopy = hasText || imageAttachments.length > 0;

  async function handleCopy() {
    const image = imageAttachments[0];
    if (image) {
      try {
        await copyImageToClipboard(image.url);
      } catch {
        setCopyFailed(true);
        window.setTimeout(() => setCopyFailed(false), 1800);
        return;
      }
    } else {
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
    }
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
      onClose();
    }, 900);
  }

  return (
    <div class={"fixed inset-0 z-[60] " + (desktop ? "pointer-events-none" : "")} role={desktop ? undefined : "dialog"} aria-modal={desktop ? undefined : "true"} aria-label={desktop ? undefined : "Opciones del mensaje"}>
      {!desktop ? <div
        class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      /> : null}
      <div class={desktop ? "contents" : "absolute inset-x-0 bottom-0 flex justify-center"}>
        <div
          ref={panelRef}
          role={desktop ? "menu" : undefined}
          aria-label={desktop ? "Opciones del mensaje" : undefined}
          style={desktop ? { left: `${position.left}px`, top: `${position.top}px` } : undefined}
          onKeyDown={handleMenuKeys}
          onContextMenu={(event) => event.preventDefault()}
          class={desktop
            ? "message-actions-desktop pointer-events-auto fixed max-h-[calc(100dvh-1.5rem)] w-[340px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            : "animate-sheet-in max-h-[calc(100dvh-var(--nav-h)-var(--audio-bar-h)-0.5rem)] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-2 pb-4 shadow-2xl dark:bg-slate-900"}
        >
          <div class="message-actions-reactions flex items-center justify-center gap-1 border-b border-slate-100 px-2 pb-3 pt-1 dark:border-slate-800" role={desktop ? "group" : undefined} aria-label="Reacciones rápidas">
            {REACT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role={desktop ? "menuitem" : undefined}
                tabIndex={desktop ? -1 : undefined}
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

          {!desktop && msg.text.trim() ? (
            <p class="truncate px-3 pb-2 pt-2 text-sm text-slate-400 dark:text-slate-500">
              “{msg.text.trim()}”
            </p>
          ) : null}

          <button
            type="button"
            role={desktop ? "menuitem" : undefined}
            tabIndex={desktop ? -1 : undefined}
            class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => onReply(msg)}
          >
            <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
              {REPLY_ICON}
            </span>
            {desktop ? "Responder en hilo" : "Responder"}
          </button>

          <button
            type="button"
            role={desktop ? "menuitem" : undefined}
            tabIndex={desktop ? -1 : undefined}
            class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => onForward(msg)}
          >
            <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400">
              {FORWARD_ICON}
            </span>
            Reenviar
          </button>

          <button
            type="button"
            role={desktop ? "menuitem" : undefined}
            tabIndex={desktop ? -1 : undefined}
            class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => onSave(msg)}
          >
            <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
              {SAVE_ICON}
            </span>
            Guardar en Mis guardados
          </button>

          <button
            type="button"
            role={desktop ? "menuitem" : undefined}
            tabIndex={desktop ? -1 : undefined}
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

          {canCopy ? (
            <button
              type="button"
              role={desktop ? "menuitem" : undefined}
              tabIndex={desktop ? -1 : undefined}
              class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={handleCopy}
            >
              <span
                class={
                  "grid h-9 w-9 flex-none place-items-center rounded-full " +
                  (copyFailed
                    ? "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400"
                    : copied
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                      : "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400")
                }
              >
                {copied ? CHECK_ICON : COPY_ICON}
              </span>
              {copyFailed
                ? "No se pudo copiar"
                : copied
                  ? "Copiado"
                  : imageAttachments.length > 0
                    ? "Copiar imagen"
                    : "Copiar mensaje"}
            </button>
          ) : null}

          {attachments.length > 0 ? (
            <button
              type="button"
              role={desktop ? "menuitem" : undefined}
              tabIndex={desktop ? -1 : undefined}
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

          {mine && hasText ? (
            <button
              type="button"
              role={desktop ? "menuitem" : undefined}
              tabIndex={desktop ? -1 : undefined}
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

          {onDeleteForMe ? (
            <button
              type="button"
              role={desktop ? "menuitem" : undefined}
              tabIndex={desktop ? -1 : undefined}
              class="message-action-danger flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              onClick={() => {
                onDeleteForMe(msg);
              }}
            >
              <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                {DELETE_ICON}
              </span>
              <div>
                <span class="block">Eliminar para mí</span>
                <span class="block text-xs font-normal text-slate-400 dark:text-slate-500">Solo se borrará en este dispositivo</span>
              </div>
            </button>
          ) : null}

          <button
            type="button"
            role={desktop ? "menuitem" : undefined}
            tabIndex={desktop ? -1 : undefined}
            class="message-action-danger flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
            onClick={() => {
              onDelete(msg);
            }}
          >
            <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400">
              {DELETE_ICON}
            </span>
            <div>
              <span class="block">Eliminar para todos</span>
              <span class="block text-xs font-normal text-slate-400 dark:text-slate-500">Se borrará para todos en este chat</span>
            </div>
          </button>

          {!desktop ? <button
            type="button"
            role={desktop ? "menuitem" : undefined}
            tabIndex={desktop ? -1 : undefined}
            class="mt-1 w-full rounded-xl bg-slate-100 px-3 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            onClick={onClose}
          >
            Cancelar
          </button> : null}
        </div>
      </div>
    </div>
  );
}
