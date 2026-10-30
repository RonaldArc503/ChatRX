import { useEffect, useRef, useState } from "preact/hooks";
import type { ChatAttachment, ChatMessage, MemberSnapshot } from "../../lib/chat";
import type { UserProfile } from "../../lib/profile";
import { classificationFor, formatBytes, MAX_ATTACHMENT_BYTES, uploadToCloudinary } from "../../lib/cloudinary";
import { optimizeVideo } from "../../lib/videoOptimizer";
import { MessageBubble } from "./MessageBubble";
import type { MessageMenuAnchor } from "./MessageActionsSheet";
import { formatDayLabel, sameDay } from "./time";
import { trimFormattedText, type TextFormat } from "../../lib/messageFormatting";
import { MessageTextEditor, type MessageEditorHandle } from "./MessageTextEditor";

export interface ThreadDraft {
  text: string;
  formatting?: TextFormat[];
  files: File[];
}

interface ThreadPanelProps {
  root: ChatMessage;
  replies: ChatMessage[];
  me: UserProfile;
  members: Record<string, MemberSnapshot>;
  draft: ThreadDraft;
  editingId: string | null;
  focusToken: number;
  highlightedId: string | null;
  pinnedIds: string[];
  onDraftChange: (draft: ThreadDraft) => void;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onCancelEdit: () => void;
  onSaveEdit: (message: ChatMessage, text: string, formatting: TextFormat[]) => Promise<void>;
  onSend: (text: string, attachments: ChatAttachment[], formatting: TextFormat[]) => Promise<void>;
  onOpenMenu: (message: ChatMessage, anchor?: MessageMenuAnchor) => void;
  onReact: (message: ChatMessage, emoji: string) => void;
  onOpenAttachment: (message: ChatMessage, attachment: ChatAttachment) => void;
}

export function ThreadPanel({ root, replies, me, members, draft, editingId, focusToken, highlightedId, pinnedIds,
  onDraftChange, onClose, onBusyChange, onCancelEdit, onSaveEdit, onSend, onOpenMenu, onReact, onOpenAttachment }: ThreadPanelProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const inputRef = useRef<MessageEditorHandle | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const sendingRef = useRef(false);
  const uploads = useRef(new Map<File, ChatAttachment>());
  const value = draft.text;

  useEffect(() => {
    setError(null);
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [root.id, focusToken]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const settle = () => {
      if (stickRef.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    };
    const observer = new ResizeObserver(settle);
    observer.observe(content);
    settle();
    return () => observer.disconnect();
  }, [root.id]);

  useEffect(() => {
    if (!highlightedId) return;
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current;
      const target = el?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(highlightedId)}"]`);
      if (el && target) el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientHeight / 2 + target.offsetHeight / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [root.id, highlightedId]);

  function changeText(text: string, formatting: TextFormat[]) {
    onDraftChange({ ...draft, text, formatting });
  }

  function addFiles(files: File[]) {
    if (sendingRef.current || files.length === 0) return;
    if (draft.files.length + files.length > 10) {
      setError("Puedes adjuntar hasta 10 archivos por respuesta.");
      return;
    }
    const tooLarge = files.find((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (tooLarge) {
      setError(`${tooLarge.name} supera el límite de 20 MB.`);
      return;
    }
    setError(null);
    onDraftChange({ ...draft, files: [...draft.files, ...files] });
  }

  async function submit() {
    if (sendingRef.current || (!value.trim() && draft.files.length === 0)) return;
    inputRef.current?.focus({ preventScroll: true });
    sendingRef.current = true;
    setSending(true);
    onBusyChange(true);
    setError(null);
    try {
      const attachments: ChatAttachment[] = [];
      if (draft.files.length && !navigator.onLine) throw new Error("Conéctate a internet para enviar archivos.");
      for (const file of draft.files) {
        let attachment = uploads.current.get(file);
        if (!attachment) {
          setProgress(`Preparando ${file.name}…`);
          const kind = classificationFor(file);
          const upload = kind === "video" && file.size > 5 * 1024 * 1024 ? await optimizeVideo(file) : file;
          const result = await uploadToCloudinary(upload, me.uid, (percent) => setProgress(`${file.name} · ${percent}%`));
          attachment = { kind, resourceType: result.resourceType, url: result.url, publicId: result.publicId,
            name: file.name, size: result.bytes || upload.size, mimeType: upload.type };
          for (const key of ["width", "height", "duration", "pages"] as const) {
            if (result[key] !== undefined) attachment[key] = result[key];
          }
          uploads.current.set(file, attachment);
        }
        attachments.push(attachment);
      }
      const clean = trimFormattedText(value, draft.formatting);
      await onSend(clean.text, attachments, clean.formatting);
      onDraftChange({ text: "", files: [] });
      uploads.current.clear();
      stickRef.current = true;
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo enviar la respuesta.");
    } finally {
      sendingRef.current = false;
      setSending(false);
      setProgress("");
      onBusyChange(false);
    }
  }

  function bubble(message: ChatMessage, grouped = false) {
    return <MessageBubble key={message.id} msg={message.id === root.id ? message : { ...message, replyTo: undefined }}
      mine={message.senderId === me.uid} uid={me.uid} desktop grouped={grouped}
      authorName={members[message.senderId]?.displayName || (message.senderId === me.uid ? me.displayName : "Contacto")}
      authorPhotoURL={members[message.senderId]?.photoURL || (message.senderId === me.uid ? me.photoURL : "")}
      members={members} highlighted={highlightedId === message.id} isPinned={pinnedIds.includes(message.id)} onOpenMenu={onOpenMenu} onReact={onReact}
      editing={editingId === message.id} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit}
      onOpenAttachment={onOpenAttachment} onReply={() => inputRef.current?.focus()} />;
  }

  return (
    <aside id="chat-thread-panel" class="chat-thread-panel flex min-h-0 min-w-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      aria-label="Hilo de conversación" onDragEnter={(event) => event.stopPropagation()} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); addFiles(Array.from(event.dataTransfer?.files ?? [])); }}
      onKeyDown={(event) => { if (event.key === "Escape" && !document.querySelector('[role="menu"]')) { event.stopPropagation(); onClose(); } }}>
      <header class="flex min-h-[88px] shrink-0 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
        <h2 class="text-2xl font-bold text-slate-900 dark:text-white">Hilo</h2>
        <button type="button" aria-label="Cerrar hilo" title="Cerrar hilo" disabled={sending} onClick={onClose}
          class="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" class="h-6 w-6"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
      </header>
      <div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4" ref={scrollRef}
        onScroll={() => { const el = scrollRef.current; if (el) stickRef.current = el.scrollHeight - el.clientHeight - el.scrollTop < 100; }}>
        <div ref={contentRef}>
          <p class="px-6 pt-4 text-sm text-slate-400 dark:text-slate-500">{formatDayLabel(root.createdAt)}</p>
          {bubble(root)}
          <div class="mx-6 mb-2 mt-5 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <span role="status">{replies.length} {replies.length === 1 ? "respuesta" : "respuestas"}</span><span class="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>
          {replies.map((reply, index) => {
            const previous = replies[index - 1];
            return <div key={reply.id}>
              {!sameDay(previous?.createdAt ?? root.createdAt, reply.createdAt) ? <p class="px-6 pt-4 text-sm font-semibold text-slate-500 dark:text-slate-400">{formatDayLabel(reply.createdAt)}</p> : null}
              {bubble(reply, !!previous && previous.senderId === reply.senderId && sameDay(previous.createdAt, reply.createdAt) && reply.createdAt - previous.createdAt >= 0 && reply.createdAt - previous.createdAt < 5 * 60_000)}
            </div>;
          })}
          {replies.length === 0 ? <p class="px-6 py-4 text-base text-slate-500 dark:text-slate-400">Inicia la conversación en este hilo.</p> : null}
        </div>
      </div>
      {draft.files.length > 0 ? <ul class="mx-4 max-h-32 shrink-0 overflow-y-auto text-sm text-slate-600 dark:text-slate-300" aria-label="Adjuntos del hilo">
        {draft.files.map((file, index) => <li key={`${file.name}-${index}`} class="flex items-center gap-2 py-1"><span class="min-w-0 flex-1 truncate">{file.name} · {formatBytes(file.size)}</span><button type="button" disabled={sending} aria-label={`Quitar ${file.name}`} onClick={() => { uploads.current.delete(file); onDraftChange({ ...draft, files: draft.files.filter((_, i) => i !== index) }); }} class="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">×</button></li>)}
      </ul> : null}
      <form class="mx-4 mb-4 mt-3 shrink-0 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-900"
        onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <MessageTextEditor editorRef={inputRef} value={value} formatting={draft.formatting} readOnly={sending} label="Respuesta en el hilo"
          placeholder="Responder…" className="message-editor-tall text-slate-800 dark:text-slate-100"
          onChange={changeText} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); void submit(); } }}
          onPaste={(event) => { const files = Array.from(event.clipboardData?.files ?? []); if (files.length) { event.preventDefault(); addFiles(files); } }}
          footerStart={<>
          <input ref={filesRef} type="file" multiple class="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" onChange={(event) => { addFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
          <button type="button" aria-label="Adjuntar al hilo" title="Adjuntar archivo" disabled={sending} onClick={() => filesRef.current?.click()} class="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" class="h-6 w-6"><path d="M12 5v14M5 12h14" /></svg></button>
          </>} footerEnd={<>
          <span class="min-w-0 flex-1 text-xs text-slate-400">Enter para enviar</span>
          <button type="submit" aria-label="Enviar respuesta al hilo" onPointerDown={(event) => event.preventDefault()} disabled={sending || (!value.trim() && draft.files.length === 0)} class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-6 w-6"><path d="m22 2-11 11M22 2 15 22l-4-9-9-4Z" /></svg></button>
        </>} />
      </form>
      {sending ? <p role="status" class="shrink-0 px-5 pb-3 text-sm text-indigo-600 dark:text-indigo-400">{progress || "Enviando…"}</p> : null}
      {error ? <p role="alert" class="shrink-0 px-5 pb-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </aside>
  );
}
