const WIDGET_BASE = "https://clickapi.net/api";

export function widgetPlusUrl(url: string): string {
  return `${WIDGET_BASE}/widgetplus?url=${encodeURIComponent(url)}`;
}

export function widgetUrl(url: string): string {
  return `${WIDGET_BASE}/widget?url=${encodeURIComponent(url)}`;
}

export function singleUrl(ftype: "mp3" | "mp4", url: string): string {
  return `${WIDGET_BASE}/single/${ftype}?url=${encodeURIComponent(url)}`;
}

export function buttonUrl(ftype: "mp3" | "mp4", url: string): string {
  return `${WIDGET_BASE}/button/${ftype}?url=${encodeURIComponent(url)}`;
}

export function isYouTubeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return true;
  return (
    /youtube\.com\//.test(trimmed) ||
    /youtu\.be\//.test(trimmed) ||
    /youtube-nocookie\.com\//.test(trimmed)
  );
}
