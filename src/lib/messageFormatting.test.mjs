import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFormatting, trimFormattedText, formattedSegments, fromEditorDocument, toEditorDocument } from "./messageFormatting.ts";
import { splitLinks } from "../components/chat/linkify.ts";

test("accepts only supported styles, bounds offsets, merges each style independently", () => {
  assert.deepEqual(normalizeFormatting("abcdef", [
    { start: -3, end: 2, style: "bold" }, { start: 2, end: 4, style: "bold" },
    { start: 1, end: 99, style: "italic" }, { start: 2, end: 3, style: "underline" },
    { start: 0, end: 2, style: "script" }, { start: NaN, end: 3, style: "bold" },
    { start: 4, end: 2, style: "bold" }, null,
  ]), [
    { start: 0, end: 4, style: "bold" }, { start: 1, end: 6, style: "italic" },
    { start: 2, end: 3, style: "underline" },
  ]);
});

test("trimming adjusts offsets without formatting another word", () => {
  assert.deepEqual(trimFormattedText("  Hola mundo \n", [
    { start: 2, end: 6, style: "bold" }, { start: 7, end: 12, style: "italic" },
  ]), { text: "Hola mundo", formatting: [
    { start: 0, end: 4, style: "bold" }, { start: 5, end: 10, style: "italic" },
  ] });
});

test("overlapping formats round trip safely with emoji, newlines and literal HTML", () => {
  const text = "Hola 👋\n<script>literal</script>";
  const formatting = normalizeFormatting(text, [
    { start: 0, end: text.length, style: "bold" },
    { start: 5, end: 7, style: "italic" },
    { start: 5, end: text.length, style: "underline" },
  ]);
  const document = toEditorDocument(text, formatting);
  assert.deepEqual(fromEditorDocument(document), { text, formatting });
  assert.equal(document.content[0].content.some((node) => node.type === "script"), false);
  assert.deepEqual(formattedSegments("hola", [
    { start: 0, end: 4, style: "bold" }, { start: 1, end: 3, style: "italic" },
  ]).map((segment) => [segment.text, segment.styles]), [
    ["h", ["bold"]], ["ol", ["bold", "italic"]], ["a", ["bold"]],
  ]);
});

test("pasted paragraphs and line breaks keep their plain text positions", () => {
  assert.deepEqual(fromEditorDocument({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Uno", marks: [{ type: "bold" }] }] },
    { type: "paragraph", content: [{ type: "text", text: "Dos" }, { type: "hardBreak" }, { type: "text", text: "Tres", marks: [{ type: "underline" }] }] },
  ] }), { text: "Uno\nDos\nTres", formatting: [
    { start: 0, end: 3, style: "bold" }, { start: 8, end: 12, style: "underline" },
  ] });
});

test("URLs retain trailing punctuation so the following marks do not shift", () => {
  const text = "Visita https://taskly.app, después.";
  assert.equal(splitLinks(text).map((part) => part.text).join(""), text);
});
