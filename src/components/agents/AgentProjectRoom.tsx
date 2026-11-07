import { useEffect, useRef, useState } from 'preact/hooks';
import type { User } from 'firebase/auth';
import { agentApi, watchAgentMessages, watchProjectAgents, watchProjectContexts } from '../../lib/agents';
import { REQUEST_STATES, type AgentWorkspace, type AgentMessage, type ProjectAgent, type ProjectContext } from '../../lib/agentModel';
import { Avatar } from '../chat/Avatar';
import { formatTime } from '../chat/time';
import { AgentConnections } from './AgentConnections';
import { AgentContextPanel } from './AgentContextPanel';

export function AgentProjectRoom({ user, project, ready, onBack }: { user: User; project: AgentWorkspace; ready: boolean; onBack: () => void }) {
  const [agents, setAgents] = useState<ProjectAgent[]>([]);
  const [contexts, setContexts] = useState<ProjectContext[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [tab, setTab] = useState<'chat' | 'context' | 'connections'>('chat');
  const [target, setTarget] = useState('');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<AgentMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [count, setCount] = useState(100);
  const [, tick] = useState(0);
  const requestId = useRef<string | null>(null);
  const stream = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  useEffect(() => {
    const fail = () => setError('No se pudo sincronizar este proyecto. Comprueba tu conexión.');
    const stops = [watchProjectAgents(project.id, setAgents, fail), watchProjectContexts(project.id, setContexts, fail)];
    const interval = window.setInterval(() => tick(value => value + 1), 30_000);
    return () => { stops.forEach(stop => stop()); window.clearInterval(interval); };
  }, [project.id]);
  useEffect(() => watchAgentMessages(project.id, count, setMessages, () => setError('No se pudieron cargar los mensajes.')), [project.id, count]);
  useEffect(() => {
    const list = stream.current;
    if (tab === 'chat' && list && followLatest.current) list.scrollTop = list.scrollHeight;
  }, [messages.at(-1)?.id, tab]);
  async function send(event: Event) {
    event.preventDefault(); setSending(true); setError('');
    try {
      requestId.current ??= crypto.randomUUID();
      const path = replyTo ? `/workspaces/${project.id}/requests/${replyTo.id}/reply` : `/workspaces/${project.id}/messages`;
      await agentApi(path, replyTo ? { text, requestId: requestId.current } : { text, requestId: requestId.current,
        kind: target ? 'question' : 'message', ...(target ? { targetAgentId: target } : {}) });
      setText(''); setReplyTo(null); requestId.current = null;
    } catch (failure) { setError((failure as Error).message); }
    finally { setSending(false); }
  }
  async function retry(message: AgentMessage) {
    try { await agentApi(`/workspaces/${project.id}/requests/${message.id}/retry`, {}); setError(''); }
    catch (failure) { setError((failure as Error).message); }
  }
  return <section class="flex flex-col gap-4" aria-label={`Proyecto ${project.name}`}>
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div><button onClick={onBack} class="mb-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">← Todos los proyectos</button>
        <h1 class="text-xl font-extrabold text-slate-900 dark:text-white">{project.name}</h1><p class="mt-1 text-xs text-slate-500">{project.description || 'Contexto y conversación de tu equipo de IAs.'}</p></div>
      <div class="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">{([['chat','Conversación'],['context','Contexto'],['connections','Conexiones']] as const).map(([value, label]) => <button key={value} onClick={() => setTab(value)} aria-pressed={tab === value} class={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === value ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300' : 'text-slate-500'}`}>{label}</button>)}</div>
    </header>
    {!ready ? <p role="status" class="text-xs text-amber-700 dark:text-amber-300">Servidor de conexión no disponible. Puedes consultar la información sincronizada.</p> : null}
    {error ? <p role="alert" class="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    <div class="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {tab === 'connections' ? <div class="mx-auto max-w-2xl p-5"><AgentConnections projectId={project.id} agents={agents} ready={ready} /></div> : null}
      {tab === 'context' ? <div class="mx-auto max-w-3xl p-5"><AgentContextPanel projectId={project.id} contexts={contexts} ready={ready} /></div> : null}
      {tab === 'chat' ? <>
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800"><span>{agents.filter(agent => agent.active).length} conexiones · {contexts.length} contextos publicados</span><button onClick={() => setTab('connections')} class="font-semibold text-indigo-600 dark:text-indigo-400">Conectar una PC</button></div>
        <div ref={stream} onScroll={event => { const list = event.currentTarget; followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80; }} class="h-[min(56vh,600px)] min-h-64 overflow-y-auto px-4 py-5 sm:px-6" aria-label="Mensajes del proyecto" aria-live="polite" aria-relevant="additions text">
          {messages.length >= count ? <button onClick={() => setCount(value => value + 100)} class="mb-5 w-full text-xs font-semibold text-indigo-600">Cargar mensajes anteriores</button> : null}
          {!messages.length ? <div class="mx-auto max-w-md py-12 text-center"><p class="font-bold text-slate-700 dark:text-slate-200">El trabajo compartido empieza aquí</p><p class="mt-2 text-sm text-slate-400">Publica el contexto inicial, conecta tus dos agentes y envía una pregunta a la otra PC.</p><button onClick={() => setTab('context')} class="mt-4 rounded-xl bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">Publicar contexto</button></div> : null}
          <div class="space-y-5">{messages.map(message => message.kind === 'context' ? <button key={message.id} onClick={() => setTab('context')} class="mx-auto block rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500 dark:bg-slate-800">{message.senderName} · {message.text}</button> : <article key={message.id} class="flex gap-3">
            <Avatar uid={message.senderId} name={message.senderName} photoURL="" size="sm" />
            <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><span class="text-sm font-bold text-slate-800 dark:text-slate-200">{message.senderId === user.uid ? 'Tú' : message.senderName}</span>
              {message.senderKind === 'agent' ? <span class="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">IA</span> : null}<time class="text-[11px] text-slate-400">{formatTime(message.createdAt)}</time></div>
              {message.replyTo ? <p class="mt-1 text-xs text-indigo-500">Respuesta a una pregunta del proyecto</p> : null}
              {message.targetAgentName ? <p class="mt-1 text-xs text-slate-400">Para {message.targetAgentName}</p> : null}
              <p class="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">{message.text}</p>
              {message.kind === 'question' ? <div class="mt-2 flex flex-wrap items-center gap-3 text-xs"><span class={message.status === 'answered' ? 'text-emerald-600' : 'text-slate-400'}>{message.status === 'processing' && (message.processingUntil ?? 0) < Date.now() ? 'En espera de reconexión' : REQUEST_STATES[message.status]}</span>
                {message.status !== 'answered' ? <button onClick={() => { setReplyTo(message); setText(''); requestId.current = null; }} class="font-semibold text-indigo-600 dark:text-indigo-400">Responder yo</button> : null}
                {message.status === 'failed' || (message.status === 'processing' && (message.processingUntil ?? 0) < Date.now()) ? <button disabled={!ready} onClick={() => retry(message)} class="font-semibold text-indigo-600">Reintentar</button> : null}</div> : null}
              {message.lastError ? <p class="mt-2 text-xs text-amber-700 dark:text-amber-400">{message.lastError}</p> : null}
            </div>
          </article>)}</div>
        </div>
        <form onSubmit={send} class="border-t border-slate-100 p-4 dark:border-slate-800">
          {replyTo ? <div class="mb-2 flex items-center justify-between rounded-lg bg-indigo-50 p-2 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"><span class="truncate">Responder: {replyTo.text}</span><button type="button" onClick={() => { setReplyTo(null); requestId.current = null; }} class="ml-2 font-bold">Cancelar</button></div> : <label class="mb-2 flex items-center gap-2 text-xs text-slate-500">Destino<select aria-label="Destinatario" disabled={sending} value={target} onChange={event => { setTarget(event.currentTarget.value); requestId.current = null; }} class="rounded-lg border border-slate-200 bg-transparent px-2 py-1.5 dark:border-slate-700"><option value="">Todo el proyecto</option>{agents.filter(agent => agent.active).map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>}
          <div class="flex items-end gap-3"><textarea aria-label="Mensaje para el equipo IA" disabled={sending} required maxLength={8000} rows={3} value={text} onInput={event => { setText(event.currentTarget.value); requestId.current = null; }} placeholder={replyTo ? 'Escribe tu respuesta…' : target ? '¿Qué necesitas saber de esta PC?' : 'Comparte un avance con el equipo…'} class="min-w-0 flex-1 resize-y rounded-xl border border-slate-200 bg-transparent p-3 text-sm dark:border-slate-700" />
            <button disabled={!ready || sending || !text.trim()} class="rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{sending ? 'Enviando…' : replyTo ? 'Responder' : target ? 'Preguntar' : 'Enviar'}</button></div>
        </form>
      </> : null}
    </div>
  </section>;
}
