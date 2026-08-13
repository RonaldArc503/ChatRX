import { useEffect, useRef, useState } from "preact/hooks";
import type { ChatAttachment, ChatMessage, MemberSnapshot } from "../../lib/chat";
import { attachmentMediaUrl, formatBytes } from "../../lib/cloudinary";
import {
  formatDuration,
  getAudioState,
  playWithLoop,
  playWithQueue,
  playWithRepeat,
  seekAudio,
  setAudioMode,
  subscribeAudio,
  toggleTrack,
  type AudioTrack,
} from "../../lib/audioPlayer";
import { findMentionRanges } from "./mention";
import { splitLinks } from "./linkify";
import { formatTime } from "./time";
import { authorTextColor } from "./Avatar";

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
  showAuthor?: boolean;
  authorName?: string;
  members?: Record<string, MemberSnapshot>;
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
  showAuthor,
  authorName,
  members,
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
  const mentionedMe = msg.mentions?.includes(uid) ?? false;
  const mentionRanges = members ? findMentionRanges(msg.text, members) : [];

  return (
    <div class={"flex flex-col " + (mine ? "items-end" : "items-start")}>
      {showAuthor && !mine ? (
        <span
          class={
            "mb-0.5 ml-3 flex items-center gap-1 text-[12px] font-semibold " +
            authorTextColor(msg.senderId)
          }
        >
          {authorName || "Usuario"}
          {mentionedMe ? (
            <span class="text-[10px] font-bold uppercase text-amber-500">@tí</span>
          ) : null}
        </span>
      ) : null}
      <div
        data-message-id={msg.id}
        class={
          "max-w-[80%] select-none rounded-[18px] shadow-sm " +
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
              {msg.replyTo.senderId === uid
                ? "Tú"
                : members?.[msg.replyTo.senderId]?.displayName || "Contacto"}
            </span>
            <span class="mt-0.5 block truncate">{msg.replyTo.text || "Adjunto"}</span>
          </button>
        ) : null}

        {msg.forwardedFrom ? (
          <span
            class={
              "flex items-center gap-1 text-[12px] font-semibold " +
              (hasMedia ? "m-2 mb-0 " : "mb-1 ") +
              (mine ? "text-indigo-100/90" : "text-indigo-500 dark:text-indigo-400")
            }
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" class="h-3 w-3 flex-none">
              <path d="m4 12 10-8" />
              <path d="m14 4 6 8-6 8Z" />
              <path d="M4 12h16" />
            </svg>
            <span class="truncate">
              {msg.forwardedFrom.uid === uid
                ? "Reenviado de ti"
                : `Reenviado de ${msg.forwardedFrom.name}`}
            </span>
          </span>
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
            {renderRichText(msg.text, mine, mentionRanges, handleLinkClick)}
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

function renderRichText(
  text: string,
  mine: boolean,
  mentions: ReturnType<typeof findMentionRanges>,
  onLinkClick: (e: MouseEvent) => void,
) {
  const segs = splitLinks(text);
  const out: preact.ComponentChild[] = [];
  let textPos = 0;
  let keyCounter = 0;

  for (const seg of segs) {
    if (seg.url) {
      if (seg.text.length > 0) {
        out.push(
          <a
            key={"l" + keyCounter++}
            href={seg.url}
            target="_blank"
            rel="noopener noreferrer"
            class={
              "break-all underline underline-offset-2 " +
              (mine ? "decoration-indigo-300" : "text-indigo-600 dark:text-indigo-400")
            }
            onClick={onLinkClick}
          >
            {seg.text}
          </a>,
        );
      }
      textPos += seg.text.length;
      continue;
    }

    let remaining = seg.text;
    let offset = 0;
    while (remaining.length > 0) {
      const match = mentions.find(
        (m) => m.start >= textPos + offset && m.start < textPos + offset + remaining.length,
      );
      if (match && match.start > textPos + offset) {
        out.push(
          <span key={"t" + keyCounter++}>
            {remaining.slice(0, match.start - (textPos + offset))}
          </span>,
        );
      }
      if (match) {
        const localStart = match.start - (textPos + offset);
        const end = match.start + match.displayName.length + 1;
        const localEnd = end - (textPos + offset);
        const len = Math.min(localEnd, remaining.length) - localStart;
        out.push(
          <span
            key={"m" + keyCounter++}
            class={
              "rounded-md " +
              (mine
                ? "bg-white/25 text-white"
                : "bg-indigo-100 font-semibold text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-300")
            }
          >
            {remaining.slice(localStart, localStart + len)}
          </span>,
        );
        offset += localEnd;
      } else {
        out.push(<span key={"t" + keyCounter++}>{remaining}</span>);
        offset += remaining.length;
      }
      remaining = seg.text.slice(offset);
    }
    textPos += seg.text.length;
  }
  return out;
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

  if (a.kind === "audio") {
    return (
      <AudioCard
        a={a}
        mine={mine}
        track={{
          id: a.publicId,
          url: a.url,
          name: a.name,
          msgId: a.publicId,
        }}
      />
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

interface AudioCardProps {
  a: ChatAttachment;
  mine: boolean;
  track: AudioTrack;
}

function AudioCard({ a, mine, track }: AudioCardProps) {
  const [state, setState] = useState(() => getAudioState());
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeAudio(setState), []);

  const isCurrent = state.currentId === track.id;
  const isPlaying = isCurrent && state.playing;
  const now = isCurrent ? state.currentTime : 0;
  const dur = isCurrent && state.duration > 0 ? state.duration : durationCompat(a);
  const pct = dur > 0 ? Math.min(100, (now / dur) * 100) : 0;

  function handlePlayPause(e: MouseEvent) {
    e.stopPropagation();
    setMenuOpen(false);
    if (isCurrent) {
      toggleTrack(track);
    } else if (state.mode === "repeat") {
      playWithRepeat(track);
    } else if (state.mode === "loop") {
      playWithLoop(track);
    } else {
      playWithQueue(track);
    }
  }

  function handleSeek(e: MouseEvent) {
    const el = barRef.current;
    if (!el || dur <= 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seekAudio(ratio * dur);
  }

  return (
    <div
      class={
        "relative flex max-w-full select-none flex-row items-center gap-3 rounded-2xl px-3 py-2.5 " +
        (mine
          ? "bg-white/15"
          : "bg-slate-100 dark:bg-slate-700/50")
      }
    >
      <button
        type="button"
        aria-label={isPlaying ? "Pausar audio" : "Reproducir audio"}
        onClick={handlePlayPause}
        class={
          "grid h-11 w-11 flex-none place-items-center rounded-full transition-all active:scale-95 " +
          (mine
            ? "bg-white text-indigo-700"
            : "bg-indigo-600 text-white hover:bg-indigo-500")
        }
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5 translate-x-[1px]">
            <path d="M7 4.6v14.8a1 1 0 0 0 1.5.86l12-7.4a1 1 0 0 0 0-1.72l-12-7.4A1 1 0 0 0 7 4.6Z" />
          </svg>
        )}
      </button>

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
            "mt-1 block text-[11px] font-medium tabular-nums " +
            (mine ? "text-indigo-100/80" : "text-slate-500 dark:text-slate-400")
          }
        >
          {isPlaying || isCurrent ? `${formatDuration(now)} / ${formatDuration(dur)}` : formatBytes(a.size)}
        </span>
        <div
          ref={barRef}
          onClick={handleSeek}
          class={
            "group relative mt-1.5 h-1 w-full cursor-pointer overflow-hidden rounded-full " +
            (mine ? "bg-white/25" : "bg-slate-300 dark:bg-slate-600")
          }
          role="slider"
          aria-label="Progreso del audio"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(now)}
        >
          <div
            class={
              "absolute inset-y-0 left-0 rounded-full " +
              (mine ? "bg-white" : "bg-emerald-500")
            }
            style={{ width: `${pct}%` }}
          />
        </div>
      </span>

      <div class="relative flex-none">
        <button
          type="button"
          aria-label="Opciones de reproducción"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          class={
            "grid h-7 w-7 place-items-center rounded-full transition-colors " +
            (mine
              ? "text-white/80 hover:bg-white/15"
              : "text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-600/60")
          }
        >
          <svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        </button>

        {menuOpen ? (
          <>
            <div
              class="fixed inset-0 z-20"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
              }}
            />
            <div
              class={
                "absolute right-0 bottom-8 z-30 w-60 overflow-hidden rounded-2xl border p-1 shadow-2xl " +
                (mine
                  ? "border-white/15 bg-slate-800 text-white"
                  : "border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100")
              }
              onClick={(e) => e.stopPropagation()}
            >
              <span
                class={
                  "block px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide " +
                  (mine ? "text-indigo-200/70" : "text-slate-400")
                }
              >
                Reproducción
              </span>
              <ModeRow
                mine={mine}
                active={state.mode === "queue"}
                label="Seguir con el siguiente"
                hint="Reproduce uno tras otro"
                icon="queue"
                onClick={() => {
                  if (isCurrent) setAudioMode("queue");
                  else playWithQueue(track);
                  setMenuOpen(false);
                }}
              />
              <ModeRow
                mine={mine}
                active={state.mode === "loop"}
                label="Repetir lista"
                hint="Al terminar, vuelve a empezar"
                icon="loop"
                onClick={() => {
                  if (isCurrent) setAudioMode("loop");
                  else playWithLoop(track);
                  setMenuOpen(false);
                }}
              />
              <ModeRow
                mine={mine}
                active={state.mode === "repeat"}
                label="Repetir este audio"
                hint="En bucle, sin parar"
                icon="repeat"
                onClick={() => {
                  if (isCurrent) setAudioMode("repeat");
                  else playWithRepeat(track);
                  setMenuOpen(false);
                }}
              />
            </div>
          </>
        ) : null}
      </div>

      {isPlaying ? (
        <span
          class={
            "absolute top-2 right-9 grid h-5 w-5 place-items-center rounded-full " +
            (mine
              ? "bg-white/20 text-white"
              : "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/25 dark:text-indigo-300")
          }
          aria-label="Reproduciendo"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" class="h-3 w-3">
            <path d="M12 2v4" />
            <path d="M5.64 3.64 8.5 6.5" />
            <path d="M18.36 3.64 15.5 6.5" />
          </svg>
        </span>
      ) : null}
    </div>
  );
}

function ModeRow({
  mine,
  active,
  label,
  hint,
  icon,
  onClick,
}: {
  mine: boolean;
  active: boolean;
  label: string;
  hint: string;
  icon: "queue" | "repeat" | "loop";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors " +
        (active
          ? mine
            ? "bg-white/15"
            : "bg-indigo-50 dark:bg-indigo-500/20"
          : "hover:bg-black/5 dark:hover:bg-white/10")
      }
    >
      <span
        class={
          "grid h-8 w-8 flex-none place-items-center rounded-lg " +
          (mine
            ? "bg-white/15 text-white"
            : "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/25 dark:text-indigo-300")
        }
      >
        {icon === "queue" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
            <path d="M3 6h13" />
            <path d="M3 12h13" />
            <path d="M3 18h7" />
            <path d="m16 16 3 3 4-6" />
          </svg>
        ) : icon === "repeat" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
            <path d="m17 2 4 4-4 4" />
            <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
            <path d="m7 22-4-4 4-4" />
            <path d="M21 13v1a4 4 0 0 1-4 4H3" />
            <path d="M12 12h.01" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
            <path d="m17 2 4 4-4 4" />
            <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
            <path d="m7 22-4-4 4-4" />
            <path d="M21 13v1a4 4 0 0 1-4 4H3" />
          </svg>
        )}
      </span>
      <span class="min-w-0 flex-1">
        <span
          class={
            "block text-sm font-semibold " +
            (active
              ? mine
                ? "text-white"
                : "text-indigo-700 dark:text-indigo-300"
              : mine
                ? "text-white"
                : "text-slate-700 dark:text-slate-200")
          }
        >
          {label}
        </span>
        <span
          class={
            "block text-[11px] " +
            (mine ? "text-indigo-100/70" : "text-slate-400 dark:text-slate-500")
          }
        >
          {hint}
        </span>
      </span>
      {active ? (
        <span class="flex-none text-indigo-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      ) : null}
    </button>
  );
}

function durationCompat(a: ChatAttachment): number {
  return a.duration && Number.isFinite(a.duration) ? a.duration : 0;
}