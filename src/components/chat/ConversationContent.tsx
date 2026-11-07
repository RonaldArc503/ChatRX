import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ChatAttachment, ChatMessage, PinnedMessage } from "../../lib/chat";
import { attachmentMediaUrl, formatBytes } from "../../lib/cloudinary";
import { CONVERSATION_TABS, conversationAttachments, conversationLinks, conversationPins, searchConversationMessages, searchMessagePreview, type ConversationTab } from "../../lib/conversationContent";

export function ConversationIcon({ kind, className = "h-4 w-4" }: { kind: ConversationTab | "search"; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" class={className}>
    {kind === "messages" ? <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1v-9.5a8.5 8.5 0 0 1 17 0Z" />
      : kind === "media" ? <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 16-5-5-7 10M3 16l4-4 4 4" /></>
      : kind === "links" ? <><path d="m10 13 4-4M8 16l-1 1a4.2 4.2 0 0 1-6-6l5-5a4.2 4.2 0 0 1 6 0M16 8l1-1a4.2 4.2 0 0 1 6 6l-5 5a4.2 4.2 0 0 1-6 0" transform="translate(1 0) scale(.9)" /></>
      : kind === "pins" ? <><path d="M12 17v5M8 3h8M9 3v7l-3 4v3h12v-3l-3-4V3" /></>
      : <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></>}
  </svg>;
}

export function ConversationTabs({ active, onChange }: { active: ConversationTab; onChange: (tab: ConversationTab) => void }) {
  return <nav role="tablist" aria-label="Contenido de la conversación" class="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-900 lg:px-5"
    onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const index = CONVERSATION_TABS.findIndex(([id]) => id === active);
      const next = event.key === "Home" ? 0 : event.key === "End" ? 3 : (index + (event.key === "ArrowLeft" ? 3 : 1)) % 4;
      event.preventDefault();
      onChange(CONVERSATION_TABS[next][0]);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>
    {CONVERSATION_TABS.map(([id, label]) => <button key={id} id={`conversation-tab-${id}`} type="button" role="tab" aria-selected={active === id}
      aria-controls={`conversation-panel-${id}`} tabIndex={active === id ? 0 : -1} onClick={() => onChange(id)}
      class={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold outline-offset-[-3px] focus-visible:outline-2 focus-visible:outline-indigo-500 ${active === id ? "border-indigo-500 text-indigo-600 dark:text-indigo-300" : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"}`}>
      <ConversationIcon kind={id} />{label}
    </button>)}
  </nav>;
}

const date = (timestamp: number) => new Date(timestamp).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
const linkButton = "rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-300 dark:hover:bg-indigo-500/15";

interface ContentProps {
  messages: ChatMessage[];
  pins: PinnedMessage[];
  authorName: (message: ChatMessage) => string;
  onJump: (message: ChatMessage) => void;
  onOpenAttachment: (message: ChatMessage, attachment: ChatAttachment) => void;
  onUnpin: (message: ChatMessage) => Promise<void>;
}

export function ConversationCollection({ tab, messages, pins, authorName, onJump, onOpenAttachment, onUnpin }: ContentProps & { tab: Exclude<ConversationTab, "messages"> }) {
  const attachments = useMemo(() => conversationAttachments(messages), [messages]);
  const links = useMemo(() => conversationLinks(messages), [messages]);
  const pinned = useMemo(() => conversationPins(messages, pins), [messages, pins]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const title = tab === "media" ? "Multimedia" : tab === "links" ? "Enlaces" : "Pines";
  const count = tab === "media" ? attachments.length : tab === "links" ? links.length : pinned.length;
  const empty = tab === "media" ? "Aquí aparecerán las fotos, videos, audios y archivos compartidos." : tab === "links" ? "Los enlaces compartidos en esta conversación aparecerán aquí." : "Fija un mensaje desde sus opciones para encontrarlo aquí.";
  return <section id={`conversation-panel-${tab}`} role="tabpanel" aria-labelledby={`conversation-tab-${tab}`} tabIndex={0}
    class="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:bg-slate-950 lg:p-6">
    <div class="mx-auto max-w-4xl">
      <div class="mb-5 flex items-center gap-2"><h2 class="text-lg font-bold">{title}</h2><span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{count}</span></div>
      {error && <p role="alert" class="mb-4 text-sm text-red-500">{error}</p>}
      {!count ? <div class="flex min-h-52 flex-col items-center justify-center gap-3 text-center text-sm text-slate-500 dark:text-slate-400"><ConversationIcon kind={tab} className="h-9 w-9 opacity-60" /><p class="max-w-sm">{empty}</p></div> : null}
      {tab === "media" ? <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{attachments.map(({ id, message, attachment: a }) => <article key={id} class="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <button type="button" aria-label={`Abrir ${a.name}`} onClick={() => onOpenAttachment(message, a)} class="block w-full text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-800">
          <div class="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-800">
            {a.kind === "image" ? <img src={attachmentMediaUrl(a.url, "w_480,h_360,c_fill,q_auto,f_auto")} alt={a.name} loading="lazy" class="h-full w-full object-cover" />
              : <span class="rounded-xl bg-white/80 px-4 py-3 text-sm font-bold uppercase text-indigo-500 dark:bg-slate-900/80">{a.kind === "video" ? "▶ Video" : a.kind === "audio" ? "♫ Audio" : a.kind === "pdf" ? "PDF" : "Archivo"}</span>}
          </div>
          <div class="p-3"><p class="truncate text-sm font-semibold" title={a.name}>{a.name}</p><p class="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{formatBytes(a.size)} · {authorName(message)}</p></div>
        </button>
        <div class="flex items-center justify-between gap-1 px-2 pb-2"><span class="truncate pl-1 text-[11px] text-slate-400">{new Date(message.createdAt).toLocaleDateString("es")}</span><button type="button" class={linkButton} onClick={() => onJump(message)}>Ver mensaje</button></div>
      </article>)}</div> : tab === "links" ? <div class="space-y-3">{links.map(({ id, message, url }) => <article key={id} class="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-500 dark:bg-indigo-500/15"><ConversationIcon kind="links" className="h-5 w-5" /></span>
        <div class="min-w-0 flex-1"><a href={url} target="_blank" rel="noopener noreferrer" class="break-all text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{url}</a><p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{authorName(message)} · {date(message.createdAt)}</p><button type="button" class={`${linkButton} -ml-2 mt-2`} onClick={() => onJump(message)}>Ver mensaje</button></div>
      </article>)}</div> : <div class="space-y-3">{pinned.map(({ message }) => <article key={message.id} class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">{authorName(message)} · {date(message.createdAt)}</p>
        <button type="button" onClick={() => onJump(message)} class="mt-2 block w-full whitespace-pre-wrap break-words text-left text-sm hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:text-indigo-300">{message.text || message.attachments?.map((a) => a.name).join(", ") || "Adjunto"}</button>
        <div class="mt-3 flex justify-between gap-3"><button type="button" class={linkButton} onClick={() => onJump(message)}>Ver mensaje</button><button type="button" disabled={removing !== null} class={`${linkButton} disabled:opacity-50`} onClick={async () => {
          setRemoving(message.id); setError("");
          try { await onUnpin(message); } catch { setError("No se pudo desfijar el mensaje. Inténtalo de nuevo."); } finally { setRemoving(null); }
        }}>{removing === message.id ? "Desfijando…" : "Desfijar"}</button></div>
      </article>)}</div>}
    </div>
  </section>;
}

export function ConversationSearch({ messages, authorName, onJump, onClose }: Pick<ContentProps, "messages" | "authorName" | "onJump"> & { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchConversationMessages(messages, query, authorName), [messages, query, authorName]);
  const [shown, setShown] = useState(50);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { setShown(50); }, [query]);
  return <aside id="conversation-search-panel" aria-label="Buscar en la conversación" class="chat-search-panel flex min-h-0 min-w-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header class="flex h-[88px] shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 dark:border-slate-800"><h2 class="text-base font-bold">Buscar en la conversación</h2><button type="button" onClick={onClose} aria-label="Cerrar búsqueda" class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-800">×</button></header>
    <form role="search" onSubmit={(event) => event.preventDefault()} class="shrink-0 p-4">
      <label class="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-950"><ConversationIcon kind="search" className="h-4 w-4 shrink-0 text-slate-400" /><input ref={input} value={query} onInput={(event) => setQuery(event.currentTarget.value)} type="search" aria-label="Buscar mensajes" placeholder="Buscar mensajes…" class="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /></label>
    </form>
    <p role="status" aria-live="polite" class="shrink-0 px-5 pb-3 text-xs text-slate-500 dark:text-slate-400">{!query.trim() ? "Busca por texto, enlace, archivo o persona." : `${results.length} ${results.length === 1 ? "resultado" : "resultados"}`}</p>
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      {query.trim() && !results.length ? <p class="px-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400">No se encontraron mensajes.</p> : null}
      {results.slice(0, shown).map((message) => <button type="button" key={message.id} onClick={() => onJump(message)} class="mb-2 block w-full rounded-lg border border-slate-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-800 dark:hover:border-indigo-600 dark:hover:bg-indigo-500/10">
        <span class="block truncate text-xs font-bold">{authorName(message)}</span><time class="mt-0.5 block text-[11px] text-slate-400">{date(message.createdAt)}</time>
        <span class="mt-2 block whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{searchMessagePreview(message, query)}</span>
        {message.attachments?.length ? <span class="mt-2 block truncate text-xs text-indigo-500 dark:text-indigo-300">{message.attachments.map((attachment) => attachment.name).join(", ")}</span> : null}
        {message.replyTo ? <span class="mt-2 block text-[11px] text-slate-400">Respuesta en un hilo</span> : null}
      </button>)}
      {results.length > shown ? <button type="button" onClick={() => setShown((value) => value + 50)} class={`${linkButton} w-full py-3`}>Mostrar más resultados</button> : null}
    </div>
  </aside>;
}
