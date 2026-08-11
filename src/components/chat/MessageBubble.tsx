import { useRef } from "preact/hooks";
import type { ChatMessage } from "../../lib/chat";
import { splitLinks } from "./linkify";
import { formatTime } from "./time";

interface MessageBubbleProps {
  msg: ChatMessage;
  mine: boolean;
  onOpenMenu: (msg: ChatMessage) => void;
}

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 12;

export function MessageBubble({ msg, mine, onOpenMenu }: MessageBubbleProps) {
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

  return (
    <div class={"flex " + (mine ? "justify-end" : "justify-start")}>
      <div
        class={
          "max-w-[80%] select-none rounded-2xl px-3.5 py-2 shadow-sm " +
          (mine
            ? "rounded-br-md bg-indigo-600 text-white"
            : "rounded-bl-md border border-slate-200 bg-white text-slate-800")
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
        <p class="whitespace-pre-wrap break-words text-[15px] leading-snug">
          {splitLinks(msg.text).map((seg, i) =>
            seg.url ? (
              <a
                key={i}
                href={seg.url}
                target="_blank"
                rel="noopener noreferrer"
                class={
                  "break-all underline underline-offset-2 " +
                  (mine ? "decoration-indigo-300" : "text-indigo-600")
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
        <p
          class={
            "mt-0.5 text-right text-[11px] leading-none " +
            (mine ? "text-indigo-200" : "text-slate-400")
          }
        >
          {msg.edited ? (
            <span class="mr-1 italic opacity-80">editado</span>
          ) : null}
          {formatTime(msg.createdAt)}
        </p>
      </div>
    </div>
  );
}