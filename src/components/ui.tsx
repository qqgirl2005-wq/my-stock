"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { fmtPct, fmtPrice } from "@/lib/format";

/* ---------------- 主題 ---------------- */

const darkQuery = "(prefers-color-scheme: dark)";
function subscribeTheme(cb: () => void) {
  const m = window.matchMedia(darkQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

/** 系統深淺色切換時讓圖表重繪 */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribeTheme, () => window.matchMedia(darkQuery).matches, () => false);
}

/** 讀取 globals.css 的設計 token，例如 cssVar("--up") */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ---------------- 版面 ---------------- */

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-2xl border border-line bg-surface shadow-card ${className}`}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-subtle">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />;
}

/* ---------------- 控制項 ---------------- */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- 數字 ---------------- */

/** 漲跌幅膠囊：▲ 20.50  +9.95% */
export function Delta({
  change,
  percent,
  size = "md",
}: {
  change: number | null;
  percent: number | null;
  size?: "sm" | "md";
}) {
  const tone = !change
    ? "bg-surface-2 text-muted"
    : change > 0
      ? "bg-up-soft text-up"
      : "bg-down-soft text-down";
  const arrow = !change ? "" : change > 0 ? "▲" : "▼";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-mono font-medium tabular-nums ${tone} ${
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-sm"
      }`}
    >
      <span>
        {arrow && <span className="mr-0.5 text-[0.8em]">{arrow}</span>}
        {change === null ? "—" : fmtPrice(Math.abs(change))}
      </span>
      <span className="opacity-80">{fmtPct(percent)}</span>
    </span>
  );
}

export function LiveDot({ live }: { live: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60" />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-up" : "bg-subtle"}`} />
    </span>
  );
}
