import { useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren, RefObject } from "preact";
import { Editor, Mark } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";
import { UndoRedo } from "@tiptap/extensions";
import { fromEditorDocument, sameFormatting, toEditorDocument, type TextFormat, type TextStyle } from "../../lib/messageFormatting";
import { readMessageClipboard } from "../../lib/messageClipboard";

const Code = Mark.create({
  name: "code", inclusive: false,
  parseHTML: () => [{ tag: "code" }],
  renderHTML: () => ["code", {}, 0],
});
const CodeBlock = Mark.create({
  name: "codeBlock", inclusive: false,
  parseHTML: () => [{ tag: "span[data-code-block]" }],
  renderHTML: () => ["span", { "data-code-block": "" }, 0],
});
const Strike = Mark.create({
  name: "strike",
  parseHTML: () => [{ tag: "s" }, { tag: "del" }],
  renderHTML: () => ["s", {}, 0],
});

export interface MessageEditorHandle {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  focus: (options?: FocusOptions) => void;
  insertText: (text: string) => void;
  setSelectionRange: (start: number, end: number) => void;
}

interface Props {
  value: string;
  formatting?: TextFormat[];
  editorRef: RefObject<MessageEditorHandle | null>;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  footerStart?: ComponentChildren;
  footerEnd?: ComponentChildren;
  onChange: (text: string, formatting: TextFormat[], input: MessageEditorHandle) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onPaste?: (event: ClipboardEvent) => void;
}

export function MessageTextEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
  const current = useRef(props);
  current.current = props;
  const [showTools, setShowTools] = useState(true);
  const [, refresh] = useState(0);
  const toolbarId = useId();
  const pastePlain = useRef(false);

  useLayoutEffect(() => {
    if (!host.current) return;
    const instance = new Editor({
      element: host.current,
      extensions: [Document, Paragraph, Text, HardBreak, Bold, Italic, Underline, Code, CodeBlock, Strike, UndoRedo],
      content: toEditorDocument(current.current.value, current.current.formatting),
      // Keep the focused textbox mounted, including while sending attachments.
      editorProps: {
        attributes: { role: "textbox", "aria-multiline": "true", class: "message-editor-input" },
        handleKeyDown: (_view, event) => {
          if (event.isComposing) return false;
          if (current.current.readOnly) {
            // Navigation, copying and Tab must still work during a send.
            if (["Tab", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key) ||
              ((event.ctrlKey || event.metaKey) && ["a", "c"].includes(event.key.toLowerCase()))) return false;
            event.preventDefault(); return true;
          }
          current.current.onKeyDown?.(event);
          return event.defaultPrevented;
        },
        handlePaste: (_view, event) => {
          if (current.current.readOnly) return true;
          current.current.onPaste?.(event);
          if (event.defaultPrevented) return true;
          const clipboard = event.clipboardData;
          if (!clipboard || (!clipboard.types.includes("text/plain") && !clipboard.types.includes("text/html"))) return false;
          const plain = clipboard.getData("text/plain");
          if (pastePlain.current) {
            pastePlain.current = false;
            event.preventDefault();
            handle.insertText(plain);
            return true;
          }
          // Pasting into code must never reinterpret operators as Markdown.
          if (instance.isActive("code") || instance.isActive("codeBlock")) {
            event.preventDefault();
            handle.insertText(plain);
            return true;
          }
          const pasted = readMessageClipboard(plain, clipboard.getData("text/html"));
          event.preventDefault();
          if (!("rich" in pasted && pasted.rich)) {
            handle.insertText(pasted.text);
            return true;
          }
          const content = toEditorDocument(pasted.text, pasted.formatting).content?.[0]?.content ?? [];
          instance.commands.insertContent(content);
          return true;
        },
        handleDOMEvents: {
          keydown: (_view, event) => {
            pastePlain.current = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "v";
            return false;
          },
          beforeinput: (_view, event) => {
            if (!current.current.readOnly) return false;
            event.preventDefault(); return true;
          },
          drop: (_view, event) => {
            if (!current.current.readOnly) return false;
            event.preventDefault(); return true;
          },
        },
      },
      onUpdate: ({ editor }) => {
        const value = fromEditorDocument(editor.getJSON());
        current.current.onChange(value.text, value.formatting, handle);
      },
      onTransaction: () => refresh((value) => value + 1),
    });
    editor.current = instance;
    function plainOffset(position: number) { return instance.state.doc.textBetween(0, position, "\n", "\n").length; }
    function documentPosition(offset: number) {
      let low = 1, high = instance.state.doc.content.size - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (plainOffset(middle) < offset) low = middle + 1;
        else high = middle;
      }
      return low;
    }
    const handle: MessageEditorHandle = {
      get value() { return fromEditorDocument(instance.getJSON()).text; },
      get selectionStart() { return plainOffset(instance.state.selection.from); },
      get selectionEnd() { return plainOffset(instance.state.selection.to); },
      focus: (options) => instance.view.dom.focus(options),
      insertText: (text) => {
        const marks = (instance.state.storedMarks ?? instance.state.selection.$from.marks()).map((mark) => mark.toJSON());
        const content = text.split("\n").flatMap((part, index) => [
          ...(index ? [{ type: "hardBreak", marks }] : []), ...(part ? [{ type: "text", text: part, marks }] : []),
        ]);
        instance.chain().focus().insertContent(content).run();
      },
      setSelectionRange: (start, end) => instance.commands.setTextSelection({ from: documentPosition(start), to: documentPosition(end) }),
    };
    current.current.editorRef.current = handle;
    refresh((value) => value + 1);
    return () => { current.current.editorRef.current = null; editor.current = null; instance.destroy(); };
  }, []);

  useLayoutEffect(() => {
    const instance = editor.current;
    if (!instance) return;
    const value = fromEditorDocument(instance.getJSON());
    if (value.text !== props.value || !sameFormatting(props.value, value.formatting, props.formatting)) {
      instance.commands.setContent(toEditorDocument(props.value, props.formatting), { emitUpdate: false });
    }
    instance.view.dom.setAttribute("aria-label", props.label);
    instance.view.dom.setAttribute("aria-readonly", String(!!props.readOnly));
    instance.view.dom.setAttribute("data-placeholder", props.placeholder ?? "");
    instance.view.dom.setAttribute("data-empty", String(instance.isEmpty));
  });

  function toggle(style: Extract<TextStyle, "bold" | "italic" | "underline">) {
    if (props.readOnly) return;
    const chain = editor.current?.chain().focus();
    if (style === "bold") chain?.toggleBold().run();
    else if (style === "italic") chain?.toggleItalic().run();
    else chain?.toggleUnderline().run();
  }

  return <div class="min-w-0">
    <div id={toolbarId} role="toolbar" aria-label="Formato del mensaje" hidden={!showTools}
      class={`${showTools ? "flex" : "hidden"} items-center gap-1 px-2 pt-1.5`}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      {([ ["bold", "Negrita", "B", "Ctrl+B"], ["italic", "Cursiva", "I", "Ctrl+I"], ["underline", "Subrayado", "U", "Ctrl+U"] ] as const).map(([style, label, glyph, shortcut]) =>
        <button key={style} type="button" aria-label={label} aria-keyshortcuts={shortcut.replace("Ctrl", "Control")} aria-pressed={editor.current?.isActive(style) ?? false}
          title={`${label} (${shortcut})`} disabled={props.readOnly} onPointerDown={(event) => event.preventDefault()} onClick={() => toggle(style)}
          class={`grid h-8 w-8 place-items-center rounded-md text-lg text-slate-500 hover:bg-slate-100 aria-pressed:bg-indigo-100 aria-pressed:text-indigo-700 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:aria-pressed:bg-indigo-500/20 dark:aria-pressed:text-indigo-300 ${style === "bold" ? "font-bold" : style === "italic" ? "font-serif italic" : "underline underline-offset-4"}`}>{glyph}</button>)}
    </div>
    <div ref={host} class={`message-editor ${props.className ?? ""}`} />
    <div class="flex flex-wrap items-center gap-1 px-2 pb-2">
      {props.footerStart}
      <button type="button" aria-label={showTools ? "Ocultar formato" : "Mostrar formato"} title={showTools ? "Ocultar formato" : "Mostrar formato"}
        aria-expanded={showTools} aria-controls={toolbarId} onPointerDown={(event) => event.preventDefault()}
        onClick={() => { setShowTools((value) => !value); props.editorRef.current?.focus({ preventScroll: true }); }}
        class="grid h-9 w-9 shrink-0 place-items-center rounded-md text-lg text-slate-500 underline underline-offset-4 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">Aa</button>
      {props.footerEnd}
    </div>
  </div>;
}
