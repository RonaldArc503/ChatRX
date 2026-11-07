import assert from "node:assert/strict";
import test from "node:test";
import { isTextAttachment, classificationFor } from "./cloudinary.ts";

test("Markdown previews cover file extensions and MIME types without changing other attachments", () => {
  for (const file of [{ name: "Guía.md", mimeType: "" }, { name: "LEEME.MD", mimeType: "application/octet-stream" },
    { name: "Guía", mimeType: "text/markdown; charset=utf-8" }, { name: "Notas", mimeType: "text/x-markdown" }]) {
    assert(isTextAttachment(file));
    assert.equal(classificationFor({ name: file.name, type: file.mimeType }), "file");
  }
  for (const name of ["photo.png", "doc.pdf", "manual.docx", "song.mp3", "file.md.exe", "file.sh.exe"]) assert(!isTextAttachment({ name }));
});

test("Shell scripts use the existing text preview, including empty or generic MIME types", () => {
  for (const file of [{ name: "setup.sh", mimeType: "" }, { name: "SETUP.SH", mimeType: "application/octet-stream" },
    { name: "script", mimeType: "application/x-sh" }, { name: "script", mimeType: "text/x-shellscript; charset=utf-8" }]) {
    assert(isTextAttachment(file));
    assert.equal(classificationFor({ name: file.name, type: file.mimeType }), "file");
  }
});
