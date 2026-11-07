import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { fromClipboardHTML, readMessageClipboard, messageClipboardHTML } from "./messageClipboard.ts";
import { fromEditorDocument, toEditorDocument, trimFormattedText, messageParts } from "./messageFormatting.ts";

globalThis.DOMParser = new JSDOM("").window.DOMParser;
const styledText = (result, style) => result.formatting.filter((range) => range.style === style).map((range) => result.text.slice(range.start, range.end));

test("ChatGPT-style Markdown keeps emphasis, lists, inline commands and fenced scripts", () => {
  const result = readMessageClipboard("## Instalación\n\n1. Abre **Taskly** y usa `npm install`.\n2. *Revisa* ~~esto~~.\n\n```sh\n  echo '<script>literal</script>'\n\n  npm run build\n```\n\n**Listo** 👋");
  assert.match(result.text, /1\. Abre Taskly y usa npm install\./);
  assert.deepEqual(styledText(result, "bold"), ["Instalación", "Taskly", "Listo"]);
  assert.deepEqual(styledText(result, "code"), ["npm install"]);
  assert.deepEqual(styledText(result, "italic"), ["Revisa"]);
  assert.deepEqual(styledText(result, "strike"), ["esto"]);
  assert.match(styledText(result, "codeBlock")[0], /^  echo '<script>literal<\/script>'\n\n  npm run build/);
  assert.deepEqual(fromEditorDocument(toEditorDocument(result.text, result.formatting)), { text: result.text, formatting: result.formatting });
});

test("rich HTML takes priority and retains styled spans, nested lists and exact code whitespace", () => {
  const result = readMessageClipboard("plain fallback", `<h2>Guía</h2><p><span style="font-weight:700">Hola 👋</span> <em>mundo</em> <u>sí</u></p><ol start="3"><li>Uno<ul><li>Dos</li></ul></li><li>Tres</li></ol><pre><code>  if (true) {\n\tconsole.log('&lt;ok&gt;');\n}\n</code><button>Copiar código</button></pre>`);
  assert.deepEqual(styledText(result, "bold"), ["Guía", "Hola 👋"]);
  assert.match(result.text, /3\. Uno\n  • Dos\n4\. Tres/);
  assert.deepEqual(styledText(result, "codeBlock"), ["  if (true) {\n\tconsole.log('<ok>');\n}\n"]);
  assert.doesNotMatch(result.text, /Copiar código/);
  const clean = trimFormattedText(result.text, result.formatting);
  assert.deepEqual(styledText(clean, "codeBlock"), styledText(result, "codeBlock"));
});

test("HTML is inert and clipboard scripts, event handlers and unsafe URLs never become markup", () => {
  const result = fromClipboardHTML(`<p><strong onclick="alert(1)">Seguro</strong><script>alert('bad')</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)">enlace</a></p>`);
  assert.equal(result.text, "Seguroenlace");
  const output = messageClipboardHTML(result.text, result.formatting);
  assert.equal(output, "<strong>Seguro</strong>enlace");
  assert.equal(readMessageClipboard("<script>alert(1)</script>").text, "<script>alert(1)</script>");
});

test("plain text, raw scripts and unformatted clipboard wrappers stay untouched", () => {
  const text = "  const url = 'https://example.com';\n\tfoo_bar_baz();\n\n";
  assert.deepEqual(readMessageClipboard(text, `<div>${text}</div>`), { text, formatting: [] });
  const markdown = readMessageClipboard("**Hola**", "<div>**Hola**</div>");
  assert.equal(markdown.text, "Hola");
  assert.deepEqual(styledText(markdown, "bold"), ["Hola"]);
});

test("copying rich messages round trips code, offsets, emphasis and multiple blocks", () => {
  const first = readMessageClipboard("**Antes**\n\n```sh\n  echo hola\n```\n\nEntre `comandos`\n\n```js\nconst x = '<b>';\n```\n\n*Después*");
  const second = readMessageClipboard(first.text, messageClipboardHTML(first.text, first.formatting));
  assert.equal(second.text, first.text);
  assert.deepEqual(second.formatting, first.formatting);
  assert.equal(messageParts(second.text, second.formatting).filter((part) => part.code).length, 2);
});

test("code at the message edges keeps indentation and trailing whitespace through send/edit", () => {
  const text = "  echo hola\n\t";
  const formatting = [{ start: 0, end: text.length, style: "codeBlock" }];
  assert.deepEqual(trimFormattedText(text, formatting), { text, formatting });
  assert.deepEqual(fromEditorDocument(toEditorDocument(text, formatting)), { text, formatting });
});

test("inline commands preserve repeated spaces and copied editor blocks preserve indentation", () => {
  const result = fromClipboardHTML('<p>Usa <code>echo "a  b"</code></p><span data-code-block>  uno<br>\tdos\n</span>');
  assert.deepEqual(styledText(result, "code"), ['echo "a  b"']);
  assert.deepEqual(styledText(result, "codeBlock"), ['  uno\n\tdos\n']);
});

test("loose Markdown lists keep the first paragraph beside its bullet", () => {
  const result = readMessageClipboard('1. **Primero**\n\n   Más detalles.\n\n2. Segundo');
  assert.match(result.text, /^1\. Primero\nMás detalles\.\n2\. Segundo$/);
  const html = fromClipboardHTML('<p><span style="text-decoration-line: underline">Subrayado</span></p>');
  assert.deepEqual(styledText(html, "underline"), ["Subrayado"]);
});
