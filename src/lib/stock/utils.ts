/** 把 "2,330.00"、"2230.0000"、"-" 之類的字串轉成數字，無效回傳 null */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(/,/g, "").trim());
  return value.trim() === "" || !Number.isFinite(n) ? null : n;
}

/** 民國日期 "115/11/02" 或 "1151102" → "2026-11-02" */
export function rocToIso(roc: string): string {
  const digits = roc.replace(/\//g, "");
  const year = Number(digits.slice(0, digits.length - 4)) + 1911;
  return `${year}-${digits.slice(-4, -2)}-${digits.slice(-2)}`;
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** 回傳 n 個月前的日期 YYYY-MM-DD */
export function monthsAgo(n: number, from = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

export function isValidStockId(id: string): boolean {
  return /^[0-9A-Z]{4,6}$/.test(id);
}

export function parseMonths(value: string | null, fallback = 6): number {
  const n = Number(value ?? fallback);
  return Number.isInteger(n) && n >= 1 && n <= 24 ? n : fallback;
}
