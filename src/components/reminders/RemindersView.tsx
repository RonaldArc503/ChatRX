import { useEffect, useRef, useState } from "preact/hooks";
import type { User } from "firebase/auth";
import {
  addReceipt,
  addReminder,
  createReminder,
  dateToTimestamp,
  deleteReminder,
  nextMonthDueDate,
  removeReceipt,
  sortReminders,
  subscribeReminders,
  timestampToDateValue,
  updateReminder,
  urgencyFor,
  urgencyLabel,
  type Receipt,
  type Reminder,
  type Urgency,
} from "../../lib/reminders";
import {
  attachmentMediaUrl,
  classificationFor,
  formatBytes,
  MAX_ATTACHMENT_BYTES,
  uploadToCloudinary,
} from "../../lib/cloudinary";
import type { ChatAttachment } from "../../lib/chat";
import {
  AttachmentLightbox,
  type LightboxItem,
} from "../chat/AttachmentLightbox";

interface RemindersViewProps {
  user: User;
}

type DraftReceipt = Receipt & {
  status: "uploading" | "done" | "error";
  progress: number;
  error?: string;
};

const URGENCY_STYLE: Record<
  Urgency,
  { card: string; chip: string; dot: string }
> = {
  overdue: {
    card: "border-red-500 bg-red-50 dark:border-red-600 dark:bg-red-500/10",
    chip: "bg-red-600 text-white",
    dot: "bg-red-500",
  },
  red: {
    card: "border-red-400 bg-red-50 dark:border-red-500 dark:bg-red-500/10",
    chip: "bg-red-500 text-white",
    dot: "bg-red-500",
  },
  orange: {
    card: "border-orange-400 bg-orange-50 dark:border-orange-500 dark:bg-orange-500/10",
    chip: "bg-orange-500 text-white",
    dot: "bg-orange-500",
  },
  green: {
    card: "border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-500/10",
    chip: "bg-emerald-600 text-white",
    dot: "bg-emerald-500",
  },
  none: {
    card: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800",
    chip: "bg-slate-500 text-white",
    dot: "bg-slate-400",
  },
};

export function RemindersView({ user }: RemindersViewProps) {
  const [items, setItems] = useState<Reminder[]>([]);
  const [title, setTitle] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [drafts, setDrafts] = useState<DraftReceipt[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uid = user.uid;

  useEffect(() => {
    return subscribeReminders(uid, setItems);
  }, [uid]);

  const sorted = sortReminders(items);
  const counts = {
    overdue: items.filter((i) => urgencyFor(i.dueDate) === "overdue").length,
    red: items.filter((i) => urgencyFor(i.dueDate) === "red").length,
    orange: items.filter((i) => urgencyFor(i.dueDate) === "orange").length,
  };

  function clearDraftUrls(list: DraftReceipt[]) {
    // sin URLs de objeto, nada que revocar
    void list;
  }

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      const id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const cls = classificationFor(file);
      const kind = cls === "image" ? ("image" as const) : cls === "pdf" ? ("pdf" as const) : null;
      if (!kind) {
        setError("Solo se admiten imágenes o PDF como comprobante.");
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setDrafts((prev) => [
          ...prev,
          {
            publicId: id,
            url: "",
            name: file.name,
            size: file.size,
            kind,
            status: "error",
            progress: 0,
            error: "Excede 20 MB",
          },
        ]);
        continue;
      }
      setDrafts((prev) => [
        ...prev,
        {
          publicId: id,
          url: "",
          name: file.name,
          size: file.size,
          kind,
          status: "uploading",
          progress: 0,
        },
      ]);
      try {
        const res = await uploadToCloudinary(file, uid, (p) => {
          setDrafts((prev) =>
            prev.map((d) => (d.publicId === id ? { ...d, progress: p } : d)),
          );
        });
        setDrafts((prev) =>
          prev.map((d) =>
            d.publicId === id
              ? {
                  ...d,
                  publicId: res.publicId,
                  url: res.url,
                  size: res.bytes || file.size,
                  status: "done",
                  progress: 100,
                }
              : d,
          ),
        );
      } catch (err) {
        setDrafts((prev) =>
          prev.map((d) =>
            d.publicId === id
              ? {
                  ...d,
                  status: "error",
                  error: err instanceof Error ? err.message : "No se pudo subir.",
                }
              : d,
          ),
        );
      }
    }
  }

  function handleFiles(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    setError(null);
    if (files.length > 0) void uploadFiles(files);
  }

  function removeDraft(id: string) {
    setDrafts((prev) => prev.filter((d) => d.publicId !== id));
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    setError(null);
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Escribe un texto para el recordatorio.");
      return;
    }
    if (drafts.some((d) => d.status === "uploading")) {
      setError("Espera a que terminen las subidas.");
      return;
    }
    if (drafts.some((d) => d.status === "error")) {
      setError("Hay comprobantes con error. Quítalos o reintenta.");
      return;
    }
    const reminder = createReminder(cleanTitle, dateToTimestamp(dateValue));
    reminder.receipts = drafts
      .filter((d) => d.status === "done" && d.url)
      .map((d) => ({
        publicId: d.publicId,
        url: d.url,
        name: d.name,
        size: d.size,
        kind: d.kind,
      }));
    setSaving(true);
    try {
      await addReminder(uid, reminder);
      clearDraftUrls(drafts);
      setDrafts([]);
      setTitle("");
      setDateValue("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo crear el recordatorio.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="mx-auto w-full max-w-2xl">
      <header class="mb-4">
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Recordatorios
        </h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Lleva el control de tus pagos y sube los comprobantes.
        </p>
        {(counts.overdue > 0 || counts.red > 0 || counts.orange > 0) ? (
          <div class="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            {counts.overdue > 0 ? (
              <span class="rounded-full bg-red-100 px-2.5 py-1 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                {counts.overdue} vencidos
              </span>
            ) : null}
            {counts.red > 0 ? (
              <span class="rounded-full bg-red-100 px-2.5 py-1 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                {counts.red} por vencer
              </span>
            ) : null}
            {counts.orange > 0 ? (
              <span class="rounded-full bg-orange-100 px-2.5 py-1 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
                {counts.orange} próximos
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      <form
        class="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        onSubmit={handleSubmit}
      >
        <label class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
          Texto a recordar
          <input
            class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            type="text"
            value={title}
            placeholder="Ej. Recibo Impuesto Pagado Agosto y Septiembre"
            aria-label="Texto a recordar"
            onInput={(event) =>
              setTitle((event.target as HTMLInputElement).value)
            }
          />
        </label>

        <div class="mt-3 flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Próxima fecha de pago
            <input
              class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              type="date"
              value={dateValue}
              aria-label="Próxima fecha de pago"
              onInput={(event) =>
                setDateValue((event.target as HTMLInputElement).value)
              }
            />
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,.pdf"
            multiple
            class="hidden"
            onChange={handleFiles}
          />
          <button
            type="button"
            aria-label="Subir comprobante"
            onClick={() => fileInputRef.current?.click()}
            class="grid h-11 w-11 flex-none place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
              <path d="M12 18v-6" />
              <path d="m9 15 3 3 3-3" />
            </svg>
          </button>
        </div>

        {drafts.length > 0 ? (
          <div class="mt-3 flex flex-wrap gap-2">
            {drafts.map((d) => (
              <div
                key={d.publicId}
                class="relative h-16 w-16 flex-none overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
              >
                {d.status === "done" && d.kind === "image" && d.url ? (
                  <img
                    src={attachmentMediaUrl(d.url, "w_200,f_auto,q_auto")}
                    alt={d.name}
                    loading="lazy"
                    class="h-full w-full object-cover"
                  />
                ) : (
                  <span class="grid h-full w-full place-items-center bg-slate-100 p-1 text-center text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {d.kind === "pdf" ? "PDF" : d.name.split(".").pop()}
                  </span>
                )}
                {d.status === "uploading" ? (
                  <div class="absolute inset-0 grid place-items-center bg-black/45">
                    <span class="text-xs font-bold text-white">{d.progress}%</span>
                  </div>
                ) : null}
                {d.status === "error" ? (
                  <div class="absolute inset-0 grid place-items-center bg-red-500/30">
                    <span class="px-1 text-center text-[9px] font-bold text-white">
                      {d.error || "Error"}
                    </span>
                  </div>
                ) : null}
                <button
                  type="button"
                  aria-label="Quitar comprobante"
                  onClick={() => removeDraft(d.publicId)}
                  class="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-[10px] text-white"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-60"
        >
          Agregar recordatorio
        </button>
      </form>

      {sorted.length === 0 ? (
        <div class="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span class="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-7 w-7">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </span>
          <p class="text-sm font-semibold text-slate-600 dark:text-slate-300">
            No tienes recordatorios
          </p>
          <p class="text-xs text-slate-400 dark:text-slate-500">
            Crea el primero arriba y agrega la fecha próxima a pagar.
          </p>
        </div>
      ) : (
        <ul class="flex flex-col gap-2.5">
          {sorted.map((item) => (
            <ReminderCard key={item.id} uid={uid} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReminderCard({ uid, item }: { uid: string; item: Reminder }) {
  const [dateValue, setDateValue] = useState(() =>
    timestampToDateValue(item.dueDate),
  );
  const [adding, setAdding] = useState(false);
  const [lightbox, setLightbox] = useState<{
    list: LightboxItem[];
    index: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const urgency = urgencyFor(item.dueDate);
  const style = URGENCY_STYLE[urgency];

  function toLightboxItem(r: Receipt): LightboxItem {
    const a: ChatAttachment = {
      kind: r.kind,
      resourceType: r.kind === "image" ? "image" : "raw",
      url: r.url,
      publicId: r.publicId,
      name: r.name,
      size: r.size,
      mimeType: r.kind === "pdf" ? "application/pdf" : "image/*",
    };
    return { a, caption: "" };
  }

  function openReceipt(r: Receipt) {
    const list = item.receipts.map(toLightboxItem);
    const index = Math.max(
      0,
      item.receipts.findIndex((x) => x.publicId === r.publicId),
    );
    setLightbox({ list, index });
  }

  async function handleDueChange(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    setDateValue(value);
    try {
      await updateReminder(uid, item.id, { dueDate: dateToTimestamp(value) });
    } catch {
      // ignora
    }
  }

  async function handleRestart() {
    const next = nextMonthDueDate(item.dueDate);
    setDateValue(timestampToDateValue(next));
    try {
      await updateReminder(uid, item.id, { dueDate: next });
    } catch {
      // ignora
    }
  }

  async function handleAddReceipt(file: File) {
    const cls = classificationFor(file);
    const kind =
      cls === "image" ? ("image" as const) : cls === "pdf" ? ("pdf" as const) : null;
    if (!kind) return;
    if (file.size > MAX_ATTACHMENT_BYTES) return;
    setAdding(true);
    try {
      const res = await uploadToCloudinary(file, uid, () => {});
      const receipt: Receipt = {
        publicId: res.publicId,
        url: res.url,
        name: file.name,
        size: res.bytes || file.size,
        kind,
      };
      await addReceipt(uid, item.id, receipt);
    } catch {
      // ignora
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveReceipt(r: Receipt) {
    try {
      await removeReceipt(uid, item.id, r);
    } catch {
      // ignora
    }
  }

  async function handleDelete() {
    try {
      await deleteReminder(uid, item.id);
    } catch {
      // ignora
    }
  }

  return (
    <li
      class={
        "rounded-2xl border-2 border-l-8 bg-white p-4 shadow-sm dark:bg-slate-900 " +
        style.card
      }
    >
      <div class="flex items-start gap-3">
        <span
          class={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${style.dot}`}
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p class="whitespace-pre-wrap break-words text-[15px] font-semibold leading-snug text-slate-800 dark:text-slate-100">
            {item.title}
          </p>

          <div class="mt-2 flex flex-wrap items-center gap-2">
            <span
              class={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${style.chip}`}
            >
              {urgencyLabel(item.dueDate)}
            </span>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-3">
            <label class="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              Fecha de pago
              <input
                type="date"
                value={dateValue}
                onInput={handleDueChange}
                class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </label>

            <button
              type="button"
              aria-label="Reiniciar conteo al próximo mes"
              title="Reiniciar conteo al próximo mes"
              onClick={handleRestart}
              class="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-3.5 w-3.5">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Reiniciar
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              class="hidden"
              onChange={(e) => {
                const input = e.target as HTMLInputElement;
                const file = input.files?.[0];
                input.value = "";
                if (file) void handleAddReceipt(file);
              }}
            />
            <button
              type="button"
              disabled={adding}
              aria-label="Agregar comprobante"
              onClick={() => fileInputRef.current?.click()}
              class="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {adding ? (
                <span class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-3.5 w-3.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                  <path d="M14 2v6h6" />
                  <path d="M12 18v-6" />
                  <path d="m9 15 3 3 3-3" />
                </svg>
              )}
              Comprobante
            </button>
          </div>

          {item.receipts.length > 0 ? (
            <div class="mt-3 flex flex-wrap gap-2">
              {item.receipts.map((r) => (
                <div
                  key={r.publicId}
                  class="relative h-16 w-16 flex-none overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                >
                  {r.kind === "image" ? (
                    <button type="button" class="block h-full w-full" onClick={() => openReceipt(r)}>
                      <img
                        src={attachmentMediaUrl(r.url, "w_200,f_auto,q_auto")}
                        alt={r.name}
                        loading="lazy"
                        class="h-full w-full object-cover"
                      />
                    </button>
                  ) : (
                    <button
                      type="button"
                      class="grid h-full w-full place-items-center p-1 text-[10px] font-bold text-slate-500 dark:text-slate-400"
                      onClick={() => openReceipt(r)}
                      title={r.name}
                    >
                      PDF
                    </button>
                  )}
                  <span class="absolute bottom-0 inset-x-0 truncate bg-black/50 px-1 py-0.5 text-[8px] text-white">
                    {formatBytes(r.size)}
                  </span>
                  <button
                    type="button"
                    aria-label="Quitar comprobante"
                    onClick={() => handleRemoveReceipt(r)}
                    class="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-[10px] text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          aria-label="Eliminar recordatorio"
          onClick={handleDelete}
          class="flex-none rounded-full bg-slate-100 p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:bg-slate-800 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      {lightbox ? (
        <AttachmentLightbox
          mediaList={lightbox.list}
          index={lightbox.index}
          onNav={(index) =>
            setLightbox((prev) => (prev ? { ...prev, index } : prev))
          }
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </li>
  );
}
