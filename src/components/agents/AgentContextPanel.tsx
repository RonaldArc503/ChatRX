import { useRef, useState } from 'preact/hooks';
import { agentApi } from '../../lib/agents';
import type { ProjectContext } from '../../lib/agentModel';

export function AgentContextPanel({ projectId, contexts, ready }: { projectId: string; contexts: ProjectContext[]; ready: boolean }) {
  const [key, setKey] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<ProjectContext | null>(null);
  const requestId = useRef<string | null>(null);
  const current = contexts.find(item => item.key === key);
  function open(context?: ProjectContext) {
    setKey(context?.key ?? ''); setTitle(context?.title ?? ''); setContent(context?.content ?? '');
    setVersion(context?.version ?? 0); setEditing(!!context); setNotice(''); setHistory(null); requestId.current = null;
  }
  function changed() { requestId.current = null; setNotice(''); }
  async function save(event: Event) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      requestId.current ??= crypto.randomUUID();
      const result = await agentApi<{ version: number }>(`/workspaces/${projectId}/context`, { key, title, content, expectedVersion: version, requestId: requestId.current });
      setVersion(result.version); setEditing(true); requestId.current = null; setNotice('Contexto guardado.');
    } catch (failure) { setNotice((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function previous() {
    try { const result = await agentApi<{ context: ProjectContext }>(`/workspaces/${projectId}/context?key=${encodeURIComponent(key)}&version=${version - 1}`); setHistory(result.context); }
    catch (failure) { setNotice((failure as Error).message); }
  }
  return <section class="flex flex-col gap-4" aria-label="Contexto compartido">
    <div class="flex items-center justify-between"><h2 class="font-bold text-slate-900 dark:text-white">Contexto compartido</h2><button onClick={() => open()} class="text-sm font-semibold text-indigo-600 dark:text-indigo-400">Nuevo</button></div>
    <p class="text-xs leading-relaxed text-slate-500">Guarda lo que ambas IAs deben conocer. Cada cambio conserva su autor y su versión.</p>
    <div class="flex flex-wrap gap-2">{contexts.map(item => <button key={item.key} onClick={() => open(item)} class={`rounded-xl border px-3 py-2 text-left text-xs ${key === item.key ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/15' : 'border-slate-200 dark:border-slate-700'}`}>
      <span class="block font-semibold">{item.title}</span><span class="text-slate-500">v{item.version} · {item.authorName}</span>
    </button>)}</div>
    <form onSubmit={save} class="flex flex-col gap-3">
      <label class="text-xs font-medium">Máquina o tema
        <input aria-label="Identificador del contexto" disabled={editing || busy} required pattern="[A-Za-z0-9_-]{1,80}" maxLength={80} value={key} onInput={event => { setKey(event.currentTarget.value); changed(); }} placeholder="dns-01" class="mt-1 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700" />
      </label>
      <input aria-label="Título del contexto" disabled={busy} required maxLength={100} value={title} onInput={event => { setTitle(event.currentTarget.value); changed(); }} placeholder="Configuración de DNS-01" class="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <textarea aria-label="Contenido del contexto" disabled={busy} required rows={10} maxLength={16000} value={content} onInput={event => { setContent(event.currentTarget.value); changed(); }} placeholder="Sistema operativo, red, servicios, comprobaciones realizadas y pendientes…" class="resize-y rounded-xl border border-slate-200 bg-transparent p-3 font-mono text-xs leading-relaxed dark:border-slate-700" />
      {current && current.version > version ? <div role="status" class="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">Hay una versión más reciente. Tu borrador se conserva. <button type="button" onClick={() => open(current)} class="font-bold underline">Cargar versión reciente</button></div> : null}
      <div class="flex items-center justify-between gap-2"><span class="text-xs text-slate-400">{version ? `Versión de partida: ${version}` : 'Documento nuevo'}</span>
        <button disabled={!ready || busy} class="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar contexto'}</button></div>
      {notice ? <p role="status" class="text-xs text-indigo-600 dark:text-indigo-300">{notice}</p> : null}
    </form>
    {editing && version > 1 ? <button onClick={previous} class="self-start text-xs font-semibold text-indigo-600 dark:text-indigo-400">Consultar versión {version - 1}</button> : null}
    {history ? <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><p class="mb-2 text-xs font-bold">Versión {history.version} · {history.authorName}</p><pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{history.content}</pre><button onClick={() => setHistory(null)} class="mt-2 text-xs text-indigo-600">Cerrar revisión</button></div> : null}
  </section>;
}
