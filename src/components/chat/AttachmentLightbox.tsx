import { useEffect, useRef, useState } from "preact/hooks";
import type { ChatAttachment } from "../../lib/chat";
import { attachmentMediaUrl } from "../../lib/cloudinary";

export interface LightboxItem {
  a: ChatAttachment;
  caption: string;
}

interface AttachmentLightboxProps {
  mediaList: LightboxItem[];
  index: number;
  onNav: (index: number) => void;
  onClose: () => void;
}

const SWIPE_THRESHOLD = 60;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 280;
const TAP_MOVE_PX = 12;

export function AttachmentLightbox({
  mediaList,
  index,
  onNav,
  onClose,
}: AttachmentLightboxProps) {
  const item = mediaList[Math.min(index, mediaList.length - 1)];
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{
    dist: number;
    scale: number;
    mid: { x: number; y: number };
    pan: { x: number; y: number };
  } | null>(null);
  const lastTap = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const downXY = useRef<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dx, setDx] = useState(0);

  if (!item) return null;

  const { a: attachment, caption } = item;
  const isFirst = index <= 0;
  const isLast = index >= mediaList.length - 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && !isFirst) onNav(index - 1);
      else if (e.key === "ArrowRight" && !isLast) onNav(index + 1);
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, isFirst, isLast, onNav, onClose]);

  useEffect(() => {
    pointers.current.clear();
    pinchStart.current = null;
    scaleRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setScale(1);
    setPan({ x: 0, y: 0 });
    setDragging(false);
    setDx(0);
  }, [index]);

  function applyZoom(nextScale: number, nextPan: { x: number; y: number }) {
    const s = Math.min(Math.max(nextScale, MIN_SCALE), MAX_SCALE);
    const el = stageRef.current;
    let p = nextPan;
    if (el) {
      const hw = (el.clientWidth / 2) * (s - 1);
      const hh = (el.clientHeight / 2) * (s - 1);
      p = {
        x: Math.min(Math.max(nextPan.x, -hw), hw),
        y: Math.min(Math.max(nextPan.y, -hh), hh),
      };
    }
    if (s <= 1.001) p = { x: 0, y: 0 };
    scaleRef.current = s;
    panRef.current = p;
    setScale(s);
    setPan(p);
  }

  function handlePointerDown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const mid = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
      pinchStart.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        scale: scaleRef.current,
        mid,
        pan: panRef.current,
      };
      setDragging(false);
    } else {
      start.current = { x: e.clientX, y: e.clientY };
      downXY.current = { x: e.clientX, y: e.clientY };
      setDragging(scaleRef.current <= 1.001);
    }
  }

  function handlePointerMove(e: PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
      const base = pinchStart.current;
      const nextScale = base.scale * (dist / base.dist);
      applyZoom(nextScale, {
        x: base.pan.x + (mid.x - base.mid.x),
        y: base.pan.y + (mid.y - base.mid.y),
      });
      return;
    }

    if (!prev || !start.current) return;

    if (scaleRef.current > 1.001) {
      const dxRaw = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      applyZoom(scaleRef.current, {
        x: panRef.current.x + dxRaw,
        y: panRef.current.y + dy,
      });
      return;
    }

    const dxRaw = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dxRaw) > Math.abs(dy)) setDx(dxRaw);
  }

  function handlePointerUp(e: PointerEvent) {
    const down = start.current;
    start.current = null;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;

    if (pointers.current.size === 0) {
      const dxRaw = e.clientX - (down?.x ?? e.clientX);
      const dy = e.clientY - (down?.y ?? e.clientY);
      setDragging(false);
      setDx(0);

      if (scaleRef.current <= 1.001) {
        const moved = Math.hypot(
          e.clientX - (downXY.current?.x ?? e.clientX),
          e.clientY - (downXY.current?.y ?? e.clientY),
        );
        if (moved < TAP_MOVE_PX) {
          const now = Date.now();
          if (now - lastTap.current < DOUBLE_TAP_MS) {
            lastTap.current = 0;
            applyZoom(2.5, { x: 0, y: 0 });
          } else {
            lastTap.current = now;
          }
        } else if (
          Math.abs(dxRaw) > SWIPE_THRESHOLD &&
          Math.abs(dxRaw) > Math.abs(dy)
        ) {
          if (dxRaw < 0 && !isLast) onNav(index + 1);
          else if (dxRaw > 0 && !isFirst) onNav(index - 1);
        }
      }
      downXY.current = null;
    }
  }

  function handlePointerCancel(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      start.current = null;
      downXY.current = null;
      setDragging(false);
      setDx(0);
    }
  }

  const transformed = scale > 1.001 || pan.x !== 0 || pan.y !== 0;

  return (
    <div class="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose}>
      <div
        class="flex items-center justify-between gap-2 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span class="min-w-0 flex-1 truncate text-sm font-semibold">
          {attachment.name}
        </span>
        {mediaList.length > 1 ? (
          <span class="flex-none text-xs font-bold tabular-nums text-white/60">
            {index + 1} / {mediaList.length}
          </span>
        ) : null}
        <div class="flex flex-none items-center gap-2">
          <button
            type="button"
            aria-label="Imagen anterior"
            disabled={isFirst}
            onClick={() => onNav(index - 1)}
            class="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20 disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Imagen siguiente"
            disabled={isLast}
            onClick={() => onNav(index + 1)}
            class="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20 disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            class="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            aria-label="Abrir en pestaña nueva"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
            </svg>
          </a>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            class="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        class="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-4"
        style={{
          touchAction: "none",
          transform: `translateX(${dragging && !transformed ? dx : 0}px)`,
          transition: dragging ? "none" : "transform 0.2s ease",
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {attachment.kind === "image" ? (
          <img
            src={attachmentMediaUrl(attachment.url, "f_auto,q_auto")}
            alt={attachment.name}
            class="max-h-full max-w-full rounded-lg object-contain select-none"
            draggable={false}
            style={{
              transformOrigin: "center center",
              transform: transformed
                ? `translate(${pan.x}px, ${pan.y}px) scale(${scale})`
                : undefined,
              transition: dragging ? "none" : "transform 0.2s ease",
              willChange: "transform",
            }}
          />
        ) : attachment.kind === "pdf" ? (
          <iframe
            src={`${attachment.url}${attachment.url.includes("?") ? "&" : "?"}#view=FitH`}
            title={attachment.name}
            class="h-full w-full rounded-lg bg-white"
          />
        ) : null}
      </div>

      {caption ? (
        <p
          class="mx-auto flex-none max-w-3xl px-6 pb-6 text-center text-sm text-slate-300"
          onClick={(e) => e.stopPropagation()}
        >
          {caption}
        </p>
      ) : null}
    </div>
  );
}