import { useEffect, useState } from "preact/hooks";

export interface TextPreviewSource { source: string; url: string }

export function TextAttachmentPreview({ url, onReady }: {
  url: string;
  onReady: (preview: TextPreviewSource | null) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    let objectUrl: string | undefined;
    setText(null); setError(""); onReady(null);
    void (async () => {
      try {
        const response = await fetch(url, { signal: abort.signal });
        if (!response.ok) throw new Error("No se pudo abrir el documento.");
        // Fetch decodes UTF-8 even when the file server omits its charset.
        const content = await response.text();
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
        setText(content); onReady({ source: url, url: objectUrl });
      } catch {
        if (!abort.signal.aborted) setError("No se pudo cargar el documento. Comprueba tu conexión.");
      }
    })();
    return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); onReady(null); };
  }, [url, attempt, onReady]);

  return <div class="h-full w-full overflow-auto rounded-lg bg-slate-900 p-4 text-slate-100 sm:p-6">
    {error ? <div role="alert"><p class="text-sm">{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} class="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20">Reintentar</button></div>
      : text === null ? <p role="status" class="text-sm text-slate-400">Cargando documento…</p>
      : <pre class="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">{text}</pre>}
  </div>;
}
