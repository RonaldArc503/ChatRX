import { useRef } from "preact/hooks";
import type { ChatAttachment, ChatMessage } from "../../lib/chat";
import { attachmentMediaUrl, formatBytes } from "../../lib/cloudinary";
import { splitLinks } from "./linkify";
import { formatTime } from "./time";

interface MessageBubbleProps {
  msg: ChatMessage;
  mine: boolean;
  uid: string;
  onOpenMenu: (msg: ChatMessage) => void;
  onReact: (msg: ChatMessage, emoji: string) => void;
  onOpenAttachment: (msg: ChatMessage, attachment: ChatAttachment) => void;
  onJumpToReply?: (msgId: string) => void;
  isPinned?: boolean;
  highlighted?: boolean;
}

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 12;

export function MessageBubble({
  msg,
  mine,
  uid,
  onOpenMenu,
  onReact,
  onOpenAttachment,
  onJumpToReply,
  isPinned,
  highlighted,
}: MessageBubbleProps) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const longPressAt = useRef(0);

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function handlePointerDown(e: PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      longPressAt.current = Date.now();
      onOpenMenu(msg);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(15);
      }
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!start.current || timer.current === null) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dx) + Math.abs(dy) > MOVE_THRESHOLD) clearTimer();
  }

  function handlePointerEnd() {
    start.current = null;
    clearTimer();
  }

  function handleLinkClick(e: MouseEvent) {
    if (Date.now() - longPressAt.current < 800) {
      e.preventDefault();
      e.stopPropagation();
      longPressAt.current = 0;
    }
  }

  function openAttachment(a: ChatAttachment) {
    if (Date.now() - longPressAt.current < 800) {
      longPressAt.current = 0;
      return;
    }
    onOpenAttachment(msg, a);
  }

  const reactions = msg.reactions ?? {};
  const byEmoji = new Map<string, number>();
  for (const entry of Object.entries(reactions)) {
    byEmoji.set(entry[1], (byEmoji.get(entry[1]) ?? 0) + 1);
  }
  const reactionRows = [...byEmoji.entries()];
  const hasMedia =
    msg.attachments?.some((a) => a.kind === "image" || a.kind === "video") ??
    false;
  const hasCaption = msg.text.trim().length > 0;

  return (
    <div class={"flex flex-col " + (mine ? "items-end" : "items-start")}>
      <div
        data-message-id={msg.id}
        class={
          "max-w-[80%] select-none rounded-2xl shadow-sm " +
          (hasMedia ? "overflow-hidden p-0 " : "px-3.5 py-2 ") +
          (highlighted ? "msg-highlight " : "") +
          (mine
            ? "rounded-br-md bg-indigo-600 text-white"
            : hasMedia
              ? "rounded-bl-md bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100"
              : "rounded-bl-md border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100")
        }
        style={{ touchAction: "pan-y" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onContextMenu={(e) => {
          e.preventDefault();
          clearTimer();
          longPressAt.current = Date.now();
          onOpenMenu(msg);
        }}
      >
        {msg.replyTo ? (
          <button
            type="button"
            class={
              "block w-full text-left " +
              (hasMedia ? "mb-1 m-2 mt-2 " : "mb-1.5 ") +
              "rounded-lg px-2.5 py-1.5 text-xs " +
              (mine
                ? "bg-white/15 text-indigo-100"
                : "bg-slate-100 text-slate-500 dark:bg-slate-700/70 dark:text-slate-300") +
              (onJumpToReply ? " cursor-pointer transition-colors " + (mine ? "hover:bg-white/25" : "hover:bg-slate-200 dark:hover:bg-slate-700") : " cursor-default")
            }
            onClick={(e) => {
              e.stopPropagation();
              if (onJumpToReply) onJumpToReply(msg.replyTo!.id);
            }}
          >
            <span class="flex items-center gap-1 font-semibold">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-3 w-3 flex-none">
                <path d="m3 11 9-9v5c6 1 9 5 9 11-2-4-5-5-9-5v5Z" />
              </svg>
              {msg.replyTo.senderId === uid ? "Tú" : "Contacto"}
            </span>
            <span class="mt-0.5 block truncate">{msg.replyTo.text || "Adjunto"}</span>
          </button>
        ) : null}

        {msg.attachments && msg.attachments.length > 0 ? (
          <div
            class={
              (hasMedia && !hasCaption ? "relative " : "") +
              "flex flex-col gap-1.5" +
              (hasMedia ? "" : " mb-1.5")
            }
          >
            {msg.attachments.map((a, i) => (
              <AttachmentItem
                key={a.publicId + i}
                a={a}
                mine={mine}
                onOpen={openAttachment}
              />
            ))}

            {hasMedia && !hasCaption ? (
              <div class="pointer-events-none absolute bottom-1.5 right-2 flex items-center gap-1">
                {isPinned ? (
                  <span class="grid h-5 w-5 place-items-center rounded-full bg-slate-900/60 text-white backdrop-blur-sm">
                    <PinIcon />
                  </span>
                ) : null}
                <span class="rounded-full bg-slate-900/60 px-2 py-0.5 text-[11px] leading-none text-white backdrop-blur-sm">
                  {msg.edited ? <span class="mr-1 italic opacity-80">editado</span> : null}
                  {formatTime(msg.createdAt)}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {hasCaption ? (
          <p
            class={
              (hasMedia ? "px-3 pb-1 pt-1.5 " : "") +
              "whitespace-pre-wrap break-words text-[15px] leading-snug"
            }
          >
            {splitLinks(msg.text).map((seg, i) =>
              seg.url ? (
                <a
                  key={i}
                  href={seg.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class={
                    "break-all underline underline-offset-2 " +
                    (mine ? "decoration-indigo-300" : "text-indigo-600 dark:text-indigo-400")
                  }
                  onClick={handleLinkClick}
                >
                  {seg.text}
                </a>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </p>
        ) : null}
        {hasMedia && !hasCaption ? null : (
          <p
            class={
              (hasMedia ? "px-3 pb-2 " : "mt-0.5 ") +
              "text-right text-[11px] leading-none " +
              (mine ? "text-indigo-200" : "text-slate-400 dark:text-slate-500")
            }
          >
            {isPinned ? <span class="mr-1 align-middle"><PinIcon /></span> : null}
            {msg.edited ? (
              <span class="mr-1 italic opacity-80">editado</span>
            ) : null}
            {formatTime(msg.createdAt)}
          </p>
        )}
      </div>

      {reactionRows.length > 0 ? (
        <div class="mt-0.5 flex flex-wrap gap-1">
          {reactionRows.map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              class={
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-sm transition-colors active:scale-95 " +
                (reactions[uid] === emoji
                  ? "border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/25 dark:text-indigo-300"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700")
              }
              aria-label={`Reacción ${emoji}`}
              onClick={() => onReact(msg, emoji)}
            >
              <span>{emoji}</span>
              <span class="tabular-nums">{count}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface AttachmentItemProps {
  a: ChatAttachment;
  mine: boolean;
  onOpen: (a: ChatAttachment) => void;
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      class="inline-block h-3 w-3"
      aria-label="Fijado"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z" />
    </svg>
  );
}

function AttachmentItem({ a, mine, onOpen }: AttachmentItemProps) {
  if (a.kind === "image") {
    return (
      <button
        type="button"
        class="block max-w-full"
        onClick={() => onOpen(a)}
      >
        <img
          src={attachmentMediaUrl(a.url, "w_700,f_auto,q_auto")}
          alt={a.name}
          loading="lazy"
          class="block max-h-80 w-auto max-w-full object-cover"
        />
      </button>
    );
  }

  if (a.kind === "video") {
    return (
      <video
        controls
        playsinline
        preload="metadata"
        src={a.url}
        class="block max-h-72 max-w-full"
      >
        <track kind="captions" />
      </video>
    );
  }

  return (
    <div
      class={
        "flex items-center gap-3 rounded-xl border px-3 py-2 " +
        (mine
          ? "border-white/15 bg-white/10"
          : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-700/40")
      }
    >
      <span
        class={
          "grid h-10 w-10 flex-none place-items-center rounded-lg " +
          (a.kind === "pdf"
            ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400"
            : "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400")
        }
      >
        {a.kind === "pdf" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            <path d="M8 13h8" />
            <path d="M8 17h5" />
          </svg>
        )}
      </span>
      <span class="min-w-0 flex-1">
        <span
          class={
            "block truncate text-sm font-semibold " +
            (mine ? "text-white" : "text-slate-800 dark:text-slate-100")
          }
        >
          {a.name}
        </span>
        <span
          class={
            "block text-xs " +
            (mine ? "text-indigo-100/80" : "text-slate-400 dark:text-slate-500")
          }
        >
          {formatBytes(a.size)}
        </span>
      </span>
      {a.kind === "pdf" ? (
        <button
          type="button"
          class="flex-none rounded-lg px-3 py-1.5 text-xs font-bold text-indigo-400 transition-colors hover:bg-indigo-500/10"
          onClick={() => onOpen(a)}
        >
          Ver
        </button>
      ) : (
        <a
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          class="flex-none rounded-lg px-3 py-1.5 text-xs font-bold text-indigo-400 transition-colors hover:bg-indigo-500/10"
        >
          Abrir
        </a>
      )}
    </div>
  );
}