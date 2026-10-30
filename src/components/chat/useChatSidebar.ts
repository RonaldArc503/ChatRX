import type { KeyboardEventHandler, PointerEventHandler } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

const STORAGE_KEY = "taskly-chat-sidebar";
const DEFAULT_WIDTH = 360;
const COLLAPSED_WIDTH = 80;
const MIN_WIDTH = 300;
const COLLAPSE_THRESHOLD = 160;

function maxWidth() {
  if (window.innerWidth < 1024) return 560;
  const railWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-rail-w")) || 0;
  return Math.min(560, Math.floor((window.innerWidth - railWidth) * 0.45));
}

function expandedWidth(width: number) {
  return Math.max(MIN_WIDTH, Math.min(maxWidth(), width));
}

export function useChatSidebar() {
  const [layout, setLayout] = useState({ width: DEFAULT_WIDTH, expanded: DEFAULT_WIDTH });
  const [ready, setReady] = useState(false);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const collapsed = layout.width === COLLAPSED_WIDTH;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.expanded)) {
        setLayout({
          width: saved.width === COLLAPSED_WIDTH ? COLLAPSED_WIDTH : expandedWidth(saved.width),
          expanded: expandedWidth(saved.expanded),
        });
      }
    } catch {
      // Resizing still works when browser storage is unavailable.
    }
    setReady(true);

    const onResize = () => {
      if (window.innerWidth < 1024) {
        drag.current = null;
        setResizing(false);
        return;
      }
      setLayout((previous) => ({
        width: previous.width === COLLAPSED_WIDTH ? COLLAPSED_WIDTH : expandedWidth(previous.width),
        expanded: expandedWidth(previous.expanded),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!ready || resizing) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Preferences are optional when storage is full or disabled.
    }
  }, [layout, ready, resizing]);

  useEffect(() => {
    if (!resizing) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [resizing]);

  function resizeTo(width: number) {
    setLayout((previous) => {
      const next = width < COLLAPSE_THRESHOLD ? COLLAPSED_WIDTH : expandedWidth(width);
      return { width: next, expanded: next === COLLAPSED_WIDTH ? previous.expanded : next };
    });
  }

  function expand() {
    setLayout((previous) => ({ ...previous, width: expandedWidth(previous.expanded) }));
  }

  function toggle() {
    setLayout((previous) => ({
      ...previous,
      width: previous.width === COLLAPSED_WIDTH ? expandedWidth(previous.expanded) : COLLAPSED_WIDTH,
    }));
  }

  const onPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, width: layout.width };
    setResizing(true);
  };

  const onPointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    resizeTo(drag.current.width + event.clientX - drag.current.x);
  };

  const onPointerUp: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
        next = layout.width <= MIN_WIDTH ? COLLAPSED_WIDTH : layout.width - 24;
        break;
      case "ArrowRight":
        next = collapsed ? MIN_WIDTH : layout.width + 24;
        break;
      case "Home": next = COLLAPSED_WIDTH; break;
      case "End": next = maxWidth(); break;
      case "Enter":
        event.preventDefault();
        toggle();
        return;
      default: return;
    }
    event.preventDefault();
    resizeTo(next);
  };

  return {
    width: layout.width,
    maxWidth: typeof window === "undefined" ? 560 : maxWidth(),
    collapsed,
    resizing,
    expand,
    toggle,
    separatorProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onLostPointerCapture: () => { drag.current = null; setResizing(false); },
      onKeyDown,
      onDblClick: toggle,
    },
  };
}
