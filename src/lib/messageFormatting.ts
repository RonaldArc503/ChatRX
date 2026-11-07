import type { JSONContent } from "@tiptap/core";

export const TEXT_STYLES = ["bold", "italic", "underline", "strike", "code", "codeBlock"] as const;
export type TextStyle = typeof TEXT_STYLES[number];
export interface TextFormat { start: number; end: number; style: TextStyle }

/** Only allowlisted marks and offsets are stored; message content is never HTML. */
export function normalizeFormatting(text: string, input: unknown): TextFormat[] {
  if (!Array.isArray(input)) return [];
  const result: TextFormat[] = [];
  for (const style of TEXT_STYLES) {
    const ranges = input.filter((item) => item && item.style === style && Number.isInteger(item.start) && Number.isInteger(item.end))
      .map((item) => ({ start: Math.max(0, item.start), end: Math.min(text.length, item.end), style }))
      .filter((item) => item.start < item.end).sort((a, b) => a.start - b.start);
    let previous: TextFormat | undefined;
    for (const range of ranges) {
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else { previous = { ...range }; result.push(previous); }
    }
  }
  return result;
}

export function trimFormattedText(text: string, formatting?: TextFormat[]) {
  const ranges = normalizeFormatting(text, formatting);
  // Whitespace within a script is part of its contents, including indentation.
  const blocks = ranges.filter((range) => range.style === "codeBlock");
  const start = Math.min(text.length - text.trimStart().length, ...blocks.map((range) => range.start));
  const end = Math.max(text.trimEnd().length, ...blocks.map((range) => range.end));
  const clean = text.slice(start, end);
  return { text: clean, formatting: normalizeFormatting(clean, normalizeFormatting(text, formatting)
    .map((range) => ({ ...range, start: range.start - start, end: range.end - start }))) };
}

/** Split around code blocks before linkifying, so code stays literal and copyable. */
export function messageParts(text: string, formatting?: TextFormat[]) {
  const blocks = normalizeFormatting(text, formatting).filter((range) => range.style === "codeBlock");
  const parts: { start: number; text: string; code: boolean }[] = [];
  let offset = 0;
  for (const block of blocks) {
    if (block.start > offset) parts.push({ start: offset, text: text.slice(offset, block.start), code: false });
    parts.push({ start: block.start, text: text.slice(block.start, block.end), code: true });
    offset = block.end;
  }
  if (offset < text.length) parts.push({ start: offset, text: text.slice(offset), code: false });
  return parts;
}

export function sameFormatting(text: string, first?: TextFormat[], second?: TextFormat[]) {
  return JSON.stringify(normalizeFormatting(text, first)) === JSON.stringify(normalizeFormatting(text, second));
}

export function formattedSegments(text: string, formatting?: TextFormat[]) {
  const ranges = normalizeFormatting(text, formatting);
  const boundaries = [...new Set([0, text.length, ...ranges.flatMap((range) => [range.start, range.end])])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => ({
    start, end: boundaries[index + 1], text: text.slice(start, boundaries[index + 1]),
    styles: TEXT_STYLES.filter((style) => ranges.some((range) => range.style === style && range.start <= start && range.end >= boundaries[index + 1])),
  }));
}

export function toEditorDocument(text: string, formatting?: TextFormat[]): JSONContent {
  const content: JSONContent[] = [];
  for (const segment of formattedSegments(text, formatting)) {
    const parts = segment.text.split("\n");
    const marks = segment.styles.map((type) => ({ type }));
    parts.forEach((part, index) => {
      if (index) content.push({ type: "hardBreak", marks });
      if (part) content.push({ type: "text", text: part, marks });
    });
  }
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

export function fromEditorDocument(document: JSONContent) {
  let text = "";
  const ranges: TextFormat[] = [];
  function visit(node: JSONContent) {
    const value = node.type === "text" ? node.text ?? "" : node.type === "hardBreak" ? "\n" : null;
    if (value !== null) {
      const start = text.length;
      text += value;
      for (const mark of node.marks ?? []) {
        if (TEXT_STYLES.includes(mark.type as TextStyle)) ranges.push({ start, end: text.length, style: mark.type as TextStyle });
      }
    } else {
      (node.content ?? []).forEach((child, index) => {
        if (node.type === "doc" && index) text += "\n";
        visit(child);
      });
    }
  }
  visit(document);
  return { text, formatting: normalizeFormatting(text, ranges) };
}
