const DATE_FMT = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
});
const LONG_FMT = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
});

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

export function formatDayLabel(ts: number): string {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86_400_000);
  if (diff <= 0) return "Hoy";
  if (diff === 1) return "Ayer";
  if (diff < 7) return DATE_FMT.format(ts);
  return LONG_FMT.format(ts);
}

export function formatTime(ts: number): string {
  if (!ts) return "";
  return TIME_FMT.format(ts);
}

export function formatLastSeen(ts: number): string {
  if (!ts) return "Sin conexión";
  const diff = Math.round((Date.now() - ts) / 86_400_000);
  if (sameDay(ts, Date.now())) {
    return `última vez hoy a las ${formatTime(ts)}`;
  }
  if (diff === 1) {
    return `última vez ayer a las ${formatTime(ts)}`;
  }
  const year = new Date(ts).getFullYear();
  if (year === new Date().getFullYear()) {
    return `última vez el ${DATE_FMT.format(ts)} a las ${formatTime(ts)}`;
  }
  return `última vez el ${LONG_FMT.format(ts)}`;
}