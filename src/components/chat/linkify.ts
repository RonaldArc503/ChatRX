export interface LinkSegment {
  text: string;
  url?: string;
}

const URL_RE = /(\bhttps?:\/\/[^\s<]+)/gi;
const TRAILING = /[.,;:!?)\]}»"'`]+$/;

function trimUrl(raw: string): string {
  return raw.replace(TRAILING, "");
}

export function splitLinks(text: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    const start = match.index;
    const raw = match[0];
    const url = trimUrl(raw);

    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start) });
    }
    segments.push({ text: url, url });

    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ text }];
}