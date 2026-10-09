// dates.ts — Lagos-time helpers (docs/08 §3: logic in Africa/Lagos, stored UTC).
export const LAGOS_TZ = "Africa/Lagos";

export function nowUtc(): Date {
  return new Date();
}

function lagosParts(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LAGOS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string): number => {
    const found = parts.find((p) => p.type === type);
    if (!found) throw new Error(`missing ${type} part`);
    return Number(found.value);
  };
  return { y: get("year"), m: get("month"), d: get("day") };
}

export function periodFor(date: Date): string {
  const { y, m } = lagosParts(date);
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function addMonths(date: Date, months: number): Date {
  const out = new Date(date.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

export function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDayUtc(a).getTime() === startOfDayUtc(b).getTime();
}
