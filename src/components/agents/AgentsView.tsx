import { useEffect, useState } from 'preact/hooks';
import type { User } from 'firebase/auth';
import { agentApi, agentServiceReady, watchAgentWorkspaces } from '../../lib/agents';
import type { AgentWorkspace } from '../../lib/agentModel';
import { AgentProjectRoom } from './AgentProjectRoom';

export function AgentsView({ user }: { user: User }) {
  const [projects, setProjects] = useState<AgentWorkspace[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    agentServiceReady().then(value => { if (active) setReady(value); });
    const stop = watchAgentWorkspaces(user.uid, setProjects, () => setError('No se pudieron cargar tus proyectos de IA.'));
    return () => { active = false; stop(); };
  }, [user.uid]);
  async function create(event: Event) {
    event.preventDefault(); setCreating(true); setError('');
    try {
      const project = await agentApi<{ id: string }>('/workspaces', { name, description });
      setName(''); setDescription(''); setSelected(project.id);
    } catch (failure) { setError((failure as Error).message); }
    finally { setCreating(false); }
  }
  const project = projects.find(item => item.id === selected);
  if (project) return <AgentProjectRoom key={project.id} user={user} project={project} ready={!!ready} onBack={() => setSelected(null)} />;
  return <section class="flex flex-col gap-6" aria-label="Proyectos para IAs">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div><p class="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Trabajo compartido</p>
        <h1 class="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">Equipo IA</h1>
        <p class="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Conecta las IAs de tus PC para compartir avances, configuraciones y preguntas dentro de cada proyecto.</p></div>
      <span class="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">OpenCode · MCP</span>
    </header>
    {ready === false ? <div role="status" class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      El servidor de conexión todavía no está disponible. Tus proyectos guardados siguen visibles.
      <button class="ml-2 font-semibold underline" onClick={async () => setReady(await agentServiceReady())}>Comprobar conexión</button>
    </div> : null}
    {error ? <p role="alert" class="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    <form onSubmit={create} class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 class="font-bold text-slate-900 dark:text-white">Nuevo proyecto</h2>
      <div class="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
        <input aria-label="Nombre del proyecto" required maxLength={80} value={name} onInput={event => setName(event.currentTarget.value)} placeholder="Laboratorio de servidores" class="rounded-xl border border-slate-200 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700" />
        <input aria-label="Descripción del proyecto" maxLength={500} value={description} onInput={event => setDescription(event.currentTarget.value)} placeholder="Qué van a coordinar las IAs" class="rounded-xl border border-slate-200 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700" />
        <button disabled={!ready || creating || !name.trim()} class="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{creating ? 'Creando…' : 'Crear proyecto'}</button>
      </div>
    </form>
    <div class="grid gap-4 md:grid-cols-2">
      {projects.map(item => <button key={item.id} onClick={() => setSelected(item.id)} class="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500">
        <span class="font-bold text-slate-900 dark:text-white">{item.name}</span><p class="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.description || 'Contexto y conversación de este proyecto.'}</p>
        <span class="mt-4 inline-block text-xs font-semibold text-indigo-600 dark:text-indigo-400">Abrir proyecto →</span>
      </button>)}
    </div>
    {!projects.length ? <p class="py-4 text-center text-sm text-slate-400">Crea un proyecto y conecta una IA en cada PC para comenzar.</p> : null}
  </section>;
}
