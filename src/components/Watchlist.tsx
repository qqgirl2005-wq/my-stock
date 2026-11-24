"use client";

import { useEffect, useRef, useState } from "react";
import { fmtPrice } from "@/lib/format";
import type { History, Quote } from "@/lib/stock/types";
import { type AnalysisState, SENTIMENT } from "@/lib/use-ai-analysis";
import Sparkline from "./Sparkline";
import { Delta, Skeleton } from "./ui";

type QuoteOrError = Quote | { stockId: string; error: string };
type Stock = { id: string; name: string };

export interface MarketStatus {
  realtime: boolean;
  updatedAt: Date | null;
  error: string | null;
}

const REFRESH_MS = 15_000;

function useBatchQuotes(ids: string[], onStatus: (s: MarketStatus) => void) {
  const key = ids.join(",");
  const [quotes, setQuotes] = useState<Record<string, QuoteOrError>>({});
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  });

  useEffect(() => {
    const ctrl = new AbortController();
    const load = () =>
      fetch(`/api/twse/quotes?ids=${key}`, { signal: ctrl.signal, cache: "no-store" })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
          const list = body as QuoteOrError[];
          setQuotes(Object.fromEntries(list.map((q) => [q.stockId, q])));
          onStatusRef.current({
            realtime: list.some((q) => "realtime" in q && q.realtime),
            updatedAt: new Date(),
            error: null,
          });
        })
        .catch((err) => {
          if (!ctrl.signal.aborted)
            onStatusRef.current({ realtime: false, updatedAt: null, error: (err as Error).message });
        });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [key]);

  return quotes;
}

/** 每檔近一個月收盤，畫迷你走勢（FinMind，伺服器快取 10 分鐘） */
function useSparklines(ids: string[]) {
  const key = ids.join(",");
  const [series, setSeries] = useState<Record<string, number[]>>({});

  useEffect(() => {
    const ctrl = new AbortController();
    for (const id of key.split(",")) {
      fetch(`/api/finmind/${id}/history?months=1`, { signal: ctrl.signal })
        .then((res) => (res.ok ? (res.json() as Promise<History>) : null))
        .then((h) => {
          if (h) setSeries((prev) => ({ ...prev, [id]: h.candles.map((c) => c.close) }));
        })
        .catch(() => {});
    }
    return () => ctrl.abort();
  }, [key]);

  return series;
}

/** 價格變動時閃一下底色 */
function FlashPrice({ price, className }: { price: number; className: string }) {
  const [prev, setPrev] = useState(price);
  const [flash, setFlash] = useState<"" | "flash-up" | "flash-down">("");
  if (price !== prev) {
    setPrev(price);
    setFlash(price > prev ? "flash-up" : "flash-down");
  }
  return (
    <span key={`${price}`} className={`-mx-1 rounded px-1 ${flash} ${className}`}>
      {fmtPrice(price)}
    </span>
  );
}

/** 卡片底部的 AI 分析按鈕：未分析 → 「AI 分析」；分析中 → 轉圈；完成 → 顯示多空結果 */
function AiButton({ name, state, onClick }: { name: string; state: AnalysisState | undefined; onClick: () => void }) {
  const loading = state?.status === "loading";
  const done = state?.status === "done" ? state.data : null;
  const s = done ? SENTIMENT[done.sentiment] : null;

  return (
    <button
      onClick={onClick}
      disabled={loading}
      aria-label={done ? `${name} AI 分析結果：${s!.label}，點擊查看或重新分析` : `AI 分析 ${name}`}
      className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-wait"
    >
      <span className="flex items-center gap-1.5">
        {loading ? (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden>
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
            <path d="M14 8a6 6 0 00-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-accent" aria-hidden>
            <path d="M8 1.5l1.6 4.2 4.4.3-3.4 2.8 1.1 4.3L8 10.7l-3.7 2.4 1.1-4.3L2 6l4.4-.3z" fill="currentColor" />
          </svg>
        )}
        {loading ? "分析中…" : state?.status === "error" ? "分析失敗，重試" : "AI 分析"}
      </span>
      {done && s && (
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${s.className}`}>
          {s.label} <span className="font-mono">{done.confidence}%</span>
        </span>
      )}
    </button>
  );
}

export default function Watchlist({
  stocks,
  selected,
  onSelect,
  onRemove,
  removing,
  onStatus,
  aiStates,
  onAnalyze,
}: {
  stocks: readonly Stock[];
  selected: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  removing: string | null;
  onStatus: (s: MarketStatus) => void;
  aiStates: Record<string, AnalysisState>;
  onAnalyze: (id: string) => void;
}) {
  const ids = stocks.map((s) => s.id);
  const quotes = useBatchQuotes(ids, onStatus);
  const sparklines = useSparklines(ids);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stocks.map((s) => {
        const q = quotes[s.id];
        const quote = q && "price" in q ? q : null;
        const active = s.id === selected;
        return (
          <div
            key={s.id}
            className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-card transition-all ${
              active ? "border-accent ring-4 ring-accent/10" : "border-line hover:-translate-y-0.5 hover:border-line-strong"
            } ${removing === s.id ? "opacity-40" : ""}`}
          >
            <button
              onClick={() => onSelect(s.id)}
              aria-pressed={active}
              className="flex w-full flex-col p-4 pb-3 text-left"
            >
              <div className="flex items-baseline gap-2 pr-6">
                <span className="truncate text-sm font-semibold">{quote?.name ?? s.name}</span>
                <span className="font-mono text-[11px] text-subtle">{s.id}</span>
              </div>

              {quote ? (
                <div className="mt-3 flex flex-col gap-1.5">
                  <FlashPrice price={quote.price} className="self-start font-mono text-[22px] font-semibold leading-none tracking-tight tabular-nums" />
                  <div>
                    <Delta change={quote.change} percent={quote.changePercent} size="sm" />
                  </div>
                </div>
              ) : q && "error" in q ? (
                <p className="mt-3 text-xs text-up">{q.error}</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              )}

              <Sparkline values={sparklines[s.id] ?? []} className="mt-3 h-10 w-full" />
            </button>

            <AiButton name={s.name} state={aiStates[s.id]} onClick={() => onAnalyze(s.id)} />

            <button
              onClick={() => onRemove(s.id)}
              disabled={removing === s.id}
              aria-label={`從追蹤清單移除 ${s.name} ${s.id}`}
              title="移除追蹤"
              className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-subtle transition hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
