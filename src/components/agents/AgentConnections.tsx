import { useState } from 'preact/hooks';
import { agentApi, agentServiceUrl } from '../../lib/agents';
import { opencodeConfiguration, agentOnline, type ProjectAgent } from '../../lib/agentModel';

export function AgentConnections({ projectId, agents, ready }: { projectId: string; agents: ProjectAgent[]; ready: boolean }) {
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<{ name: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function act(agentId?: string, revoke = false) {
    setBusy(true); setNotice('');
    try {
      const result = await agentApi<{ name?: string; token?: string }>(agentId
        ? `/workspaces/${projectId}/agents/${agentId}/${revoke ? 'revoke' : 'token'}` : `/workspaces/${projectId}/agents`, agentId ? {} : { name });
      if (result.token) setSecret({ name: result.name ?? agents.find(agent => agent.id === agentId)?.name ?? name, token: result.token });
      if (!agentId) setName('');
      setNotice(revoke ? 'Conexión revocada.' : 'Conexión preparada.');
    } catch (failure) { setNotice((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice('Copiado.'); }
    catch { setNotice('No se pudo copiar. Selecciona el texto y cópialo manualmente.'); }
  }
  const configuration = JSON.stringify(opencodeConfiguration(agentServiceUrl()), null, 2);
  return <section class="flex flex-col gap-4" aria-label="Conexiones OpenCode">
    <div><h2 class="font-bold text-slate-900 dark:text-white">Conectar OpenCode</h2><p class="mt-2 text-xs leading-relaxed text-slate-500">Crea una identidad para cada PC. Su credencial permite acceder únicamente a este proyecto.</p></div>
    <form onSubmit={event => { event.preventDefault(); void act(); }} class="flex gap-2">
      <input aria-label="Nombre del agente" disabled={busy} required maxLength={80} value={name} onInput={event => setName(event.currentTarget.value)} placeholder="IA-PC1" class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <button disabled={!ready || busy || !name.trim()} class="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Crear conexión</button>
    </form>
    <div class="space-y-3">{agents.map(agent => <div key={agent.id} class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div class="flex items-center justify-between gap-2"><span class="text-sm font-semibold">{agent.name}</span><span class={`text-xs ${agentOnline(agent) ? 'text-emerald-600' : 'text-slate-400'}`}>{!agent.active ? 'Revocada' : agentOnline(agent) ? 'Conectada recientemente' : 'Sin actividad reciente'}</span></div>
      <div class="mt-2 flex gap-3 text-xs"><button disabled={!ready || busy} onClick={() => act(agent.id)} class="font-semibold text-indigo-600 disabled:opacity-50 dark:text-indigo-400">{agent.active ? 'Renovar credencial' : 'Restaurar conexión'}</button>
        {agent.active ? <button disabled={!ready || busy} onClick={() => act(agent.id, true)} class="text-red-500 disabled:opacity-50">Revocar</button> : null}</div>
    </div>)}</div>
    {secret ? <div class="rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950">
      <p class="text-sm font-bold">Credencial de {secret.name}</p><p class="mt-1 text-xs text-slate-500">Solo se muestra ahora. Guárdala en la variable TASKLY_AGENT_TOKEN de esa PC.</p>
      <input aria-label="Credencial del agente" readOnly type="password" value={secret.token} class="mt-3 w-full rounded-lg border border-indigo-200 bg-white px-2 py-2 font-mono text-xs dark:bg-slate-900" />
      <div class="mt-2 flex gap-4 text-xs"><button onClick={() => copy(secret.token)} class="font-bold text-indigo-600 dark:text-indigo-300">Copiar credencial</button><button onClick={() => setSecret(null)} class="text-slate-500">Ya la guardé</button></div>
    </div> : null}
    {notice ? <p role="status" class="text-xs text-indigo-600 dark:text-indigo-300">{notice}</p> : null}
    <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary class="cursor-pointer text-sm font-semibold">Configuración de OpenCode</summary>
      <p class="mt-3 text-xs text-slate-500">Combina este bloque con tu opencode.json. Conserva tu proveedor y modelo, por ejemplo DeepSeek.</p>
      <pre class="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">{configuration}</pre>
      <button onClick={() => copy(configuration)} class="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">Copiar configuración</button>
      <p class="mt-3 text-xs text-slate-500">En tu chat: «Usa Taskly para consultar el contexto de este proyecto y preguntar al otro agente».</p>
    </details>
    <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary class="cursor-pointer text-sm font-semibold">Atender preguntas automáticamente</summary>
      <p class="mt-3 text-xs leading-relaxed text-slate-500">Inicia OpenCode con esta configuración y un modelo disponible. El conector abre una sesión dedicada que responde con el contexto publicado; sus herramientas quedan desactivadas.</p>
      <pre class="mt-3 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">{'# Terminal 1, en tu proyecto\nopencode serve --hostname 127.0.0.1 --port 4096\n\n# Terminal 2 (PowerShell)\n$env:TASKLY_URL="' + agentServiceUrl() + '"\n$env:TASKLY_AGENT_TOKEN="TU_CREDENCIAL"\nnode taskly-opencode.mjs'}</pre>
      <a href="/integrations/taskly-opencode.mjs" download class="mt-3 inline-block text-xs font-bold text-indigo-600 dark:text-indigo-400">Descargar conector</a>
      <p class="mt-2 text-xs text-slate-500">Realiza hasta 5 intentos de respuesta y se detiene. Requiere Node.js 22 o posterior y OpenCode activo. Si proteges OpenCode, configura también OPENCODE_SERVER_PASSWORD.</p>
    </details>
  </section>;
}
