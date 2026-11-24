const nf = (digits: number) =>
  new Intl.NumberFormat("zh-TW", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const price2 = nf(2);
const int0 = nf(0);

export const fmtPrice = (n: number | null | undefined) => (n == null ? "—" : price2.format(n));
export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : int0.format(n));
export const fmtSigned = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${nf(digits).format(Math.abs(n))}`;
export const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${price2.format(Math.abs(n))}%`;

/** 大數字縮寫：12,345 張 → 1.23 萬 */
export function fmtCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : n > 0 ? "+" : "";
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)} 億`;
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(2)} 萬`;
  return `${sign}${int0.format(abs)}`;
}

export const toneText = (n: number | null | undefined) =>
  !n ? "text-muted" : n > 0 ? "text-up" : "text-down";
