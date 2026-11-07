import { Marked } from "marked";
import { formattedSegments, messageParts, normalizeFormatting, type TextFormat, type TextStyle } from "./messageFormatting.ts";

const escapeHTML = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Raw HTML in a plain-text clipboard is literal text, including pasted scripts.
const markdown = new Marked({ breaks: true, renderer: {
  html: ({ text }) => escapeHTML(text),
  code: ({ text }) => `<pre><code>${escapeHTML(text)}</code></pre>`,
} });
const blockTags = new Set(["P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "TR"]);
const ignoredTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "NOSCRIPT", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]);

/** Read inert clipboard HTML into text and safe ranges; no source HTML is mounted. */
export function fromClipboardHTML(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  let text = "";
  let rich = false;
  const formatting: TextFormat[] = [];
  function append(value: string, styles: TextStyle[]) {
    const start = text.length;
    text += value;
    for (const style of styles) formatting.push({ start, end: text.length, style });
  }
  function newline() { if (text && !text.endsWith("\n")) text += "\n"; }
  function visit(node: Node, inherited: TextStyle[] = [], depth = 0) {
    if (node.nodeType === 3) {
      // HTML source indentation between blocks is not message content.
      const value = inherited.includes("code") ? node.textContent ?? "" : (node.textContent ?? "").replace(/\s+/g, " ");
      if (value.trim() || (text && !text.endsWith("\n"))) append(value, inherited);
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as HTMLElement;
    const tag = element.tagName;
    if (ignoredTags.has(tag) || element.hidden || element.getAttribute("aria-hidden") === "true") return;
    if (tag === "PRE" || element.dataset.codeBlock !== undefined) {
      newline();
      // Copy only code, excluding source app headers / copy controls.
      const code = element.querySelector("code") ?? element;
      const clone = code.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("button,script,style,[aria-hidden='true']").forEach((child) => child.remove());
      clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
      append(clone.textContent ?? "", ["codeBlock"]);
      text += "\n";
      rich = true;
      return;
    }
    if (tag === "BR") { append("\n", inherited); return; }
    const firstListParagraph = tag === "P" && element.parentElement?.tagName === "LI" && element === element.parentElement.firstElementChild;
    if (blockTags.has(tag) && !firstListParagraph) newline();
    const styles = [...inherited];
    const add = (style: TextStyle) => { if (!styles.includes(style)) styles.push(style); rich = true; };
    if (["B", "STRONG"].includes(tag) || /^H[1-6]$/.test(tag) || /^(bold|bolder|[6-9]00)$/.test(element.style.fontWeight)) add("bold");
    if (["I", "EM"].includes(tag) || element.style.fontStyle === "italic") add("italic");
    const decoration = `${element.style.textDecoration} ${element.style.textDecorationLine}`;
    if (tag === "U" || decoration.includes("underline")) add("underline");
    if (["S", "DEL", "STRIKE"].includes(tag) || decoration.includes("line-through")) add("strike");
    if (tag === "CODE") add("code");
    if (element.dataset.codeBlock !== undefined) add("codeBlock");
    if (tag === "LI") {
      const parent = element.parentElement;
      const index = parent ? Array.from(parent.children).filter((child) => child.tagName === "LI").indexOf(element) : 0;
      const number = element.hasAttribute("value") ? Number(element.getAttribute("value")) : Number(parent?.getAttribute("start") ?? 1) + index;
      const marker = parent?.tagName === "OL" ? `${number}. ` : "• ";
      append("  ".repeat(Math.max(0, depth - 1)) + marker, []);
      rich = true;
    }
    if (tag === "BLOCKQUOTE") { append("│ ", []); rich = true; }
    if (tag === "HR") { newline(); append("────────", []); newline(); rich = true; }
    const start = text.length;
    element.childNodes.forEach((child) => visit(child, styles, depth + (["UL", "OL"].includes(tag) ? 1 : 0)));
    if (tag === "A") {
      const href = element.getAttribute("href") ?? "";
      if (/^(https?:\/\/|mailto:)/i.test(href) && text.slice(start) !== href) append(` (${href})`, []);
    }
    if (["TD", "TH"].includes(tag) && element.nextElementSibling) append("\t", []);
    if (blockTags.has(tag)) newline();
  }
  document.body.childNodes.forEach((node) => visit(node));
  // Remove the generated block separator, preserving any code's final newline.
  if (text.endsWith("\n")) text = text.slice(0, -1);
  return { text, formatting: normalizeFormatting(text, formatting), rich };
}

export function readMessageClipboard(plain: string, html = "") {
  if (html) {
    const parsed = fromClipboardHTML(html);
    if (parsed.text && (parsed.rich || !plain)) return parsed;
  }
  const parsed = fromClipboardHTML(markdown.parse(plain, { async: false }));
  // Unformatted text remains byte-for-byte intact; do not run ordinary scripts
  // or text through Markdown whitespace normalization.
  return parsed.rich ? parsed : { text: plain, formatting: [] as TextFormat[] };
}

export function messageClipboardHTML(text: string, formatting?: TextFormat[]) {
  return messageParts(text, formatting).map((part, index, parts) => {
    if (part.code) return `<pre><code>${escapeHTML(part.text)}</code></pre>`;
    // The closing pre already contributes a line separator on import.
    const skip = index > 0 && parts[index - 1].code && part.text.startsWith("\n") ? 1 : 0;
    const ranges = formatting?.map((range) => ({ ...range, start: range.start - part.start - skip, end: range.end - part.start - skip }));
    return formattedSegments(part.text.slice(skip), ranges).map((segment) => {
      let value = escapeHTML(segment.text).replace(/\n/g, "<br>");
      for (const [style, tag] of [["code", "code"], ["strike", "s"], ["underline", "u"], ["italic", "em"], ["bold", "strong"]] as const) {
        if (segment.styles.includes(style)) value = `<${tag}>${value}</${tag}>`;
      }
      return value;
    }).join("");
  }).join("");
}

/** Copy a complete message in both rich and plain text clipboard formats. */
export async function copyFormattedMessage(text: string, formatting?: TextFormat[]) {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([messageClipboardHTML(text, formatting)], { type: "text/html" }),
      })]);
      return;
    } catch { /* Browsers without rich clipboard support can still copy text. */ }
  }
  await navigator.clipboard.writeText(text);
}
