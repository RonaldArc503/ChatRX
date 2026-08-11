import { useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

interface SwipeableProps {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  children: ComponentChildren;
  className?: string;
}

const THRESHOLD = 70;
const MAX_DRAG = 120;

export function Swipeable({
  onSwipeLeft,
  onSwipeRight,
  children,
  className,
}: SwipeableProps) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [dx, setDx] = useState(0);

  function handlePointerDown(e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    start.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!start.current || !dragging) return;
    const dxRaw = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dxRaw) > Math.abs(dy)) {
      setDx(Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dxRaw)));
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (!start.current) return;
    const dxAbs = e.clientX - start.current.x;
    start.current = null;
    setDragging(false);
    if (dxAbs > THRESHOLD) {
      finish("right");
    } else if (dxAbs < -THRESHOLD) {
      finish("left");
    } else {
      setDx(0);
    }
  }

  function handlePointerCancel() {
    start.current = null;
    setDragging(false);
    setLeaving(false);
    setDx(0);
  }

  function finish(dir: "left" | "right") {
    setLeaving(true);
    setDx(dir === "right" ? MAX_DRAG : -MAX_DRAG);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setLeaving(false);
      setDx(0);
      if (dir === "right") onSwipeRight();
      else onSwipeLeft();
    }, 180);
  }

  return (
    <div
      class={className}
      style={{
        touchAction: "pan-y",
        transform: `translateX(${dx}px)`,
        transition: leaving
          ? "transform 0.18s ease"
          : dragging
            ? "none"
            : "transform 0.25s ease",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {children}
    </div>
  );
}