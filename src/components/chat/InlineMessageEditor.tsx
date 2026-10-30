import { useEffect, useRef, useState } from "preact/hooks";
import type { ChatMessage } from "../../lib/chat";
import { sameFormatting, trimFormattedText, type TextFormat } from "../../lib/messageFormatting";
import { MessageTextEditor, type MessageEditorHandle } from "./MessageTextEditor";

interface InlineMessageEditorProps {
  message: ChatMessage;
  onSave: (message: ChatMessage, text: string, formatting: TextFormat[]) => Promise<void>;
  onCancel: () => void;
}

export function InlineMessageEditor({ message, onSave, onCancel }: InlineMessageEditorProps) {
  const [text, setText] = useState(message.text);
  const [formatting, setFormatting] = useState<TextFormat[]>(message.formatting ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<MessageEditorHandle | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [message.id]);

  async function save() {
    if (savingRef.current || !text.trim()) return;
    inputRef.current?.focus({ preventScroll: true });
    const clean = trimFormattedText(text, formatting);
    if (clean.text === message.text && sameFormatting(clean.text, clean.formatting, message.formatting)) { onCancel(); return; }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(message, clean.text, clean.formatting);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar el mensaje.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form data-message-id={message.id} data-inline-editor={message.id}
      class="my-1 overflow-hidden rounded-xl border border-indigo-300 bg-white shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/15 dark:border-indigo-500/60 dark:bg-slate-800"
      onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <MessageTextEditor editorRef={inputRef} value={text} formatting={formatting} readOnly={saving} label="Editar mensaje"
        className="message-editor-tall text-slate-800 dark:text-slate-100"
        onChange={(value, marks) => { setText(value); setFormatting(marks); }}
        onKeyDown={(event) => {
          if (event.isComposing) return;
          if (event.key === "Escape" && !savingRef.current) { event.preventDefault(); event.stopPropagation(); onCancel(); }
          else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void save(); }
        }} footerEnd={<>
        <span class="mr-auto hidden text-xs text-slate-400 dark:text-slate-500 sm:block">Enter para guardar · Esc para cancelar</span>
        <div class="ml-auto flex shrink-0 items-center gap-2">
        <button type="button" onPointerDown={(event) => event.preventDefault()} disabled={saving} onClick={onCancel}
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">Cancelar</button>
        <button type="submit" onPointerDown={(event) => event.preventDefault()} disabled={saving || !text.trim()}
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">{saving ? "Guardando…" : "Guardar"}</button>
        </div>
        </>} />
      {error ? <p role="alert" class="px-4 pb-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </form>
  );
}
