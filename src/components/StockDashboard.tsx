"use client";

import { useEffect, useState } from "react";
import { fmtInt, fmtPrice } from "@/lib/format";
import type { History, Quote, Source } from "@/lib/stock/types";
import PriceChart from "./PriceChart";
import { Card, Delta, Segmented, Skeleton } from "./ui";

const SOURCES: { value: Source; label: string }[] = [
  { value: "twse", label: "證交所" },
  { value: "finmind", label: "FinMind" },
];

const RANGES = [
  { value: 1, label: "1M" },
  { value: 3, label: "3M" },
  { value: 6, label: "6M" },
  { value: 12, label: "1Y" },
];

const QUOTE_REFRESH_MS = 15_000;

type Result<T> = { url: string; data?: T; error?: string };

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export default function StockDashboard({ stockId, stockName }: { stockId: string; stockName: string }) {
  const [source, setSource] = useState<Source>("twse");
  const [months, setMonths] = useState(6);

  // 每筆結果記下它對應的請求網址；網址變了（切換股票/來源/區間）就視為載入中
  const quoteUrl = `/api/${source}/${stockId}/quote`;
  const historyUrl = `/api/${source}/${stockId}/history?months=${months}`;
  const [quoteResult, setQuoteResult] = useState<Result<Quote> | null>(null);
  const [historyResult, setHistoryResult] = useState<Result<History> | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const load = () =>
      fetchJson<Quote>(quoteUrl, ctrl.signal)
        .then((data) => setQuoteResult({ url: quoteUrl, data }))
        .catch((err) => {
          if (!ctrl.signal.aborted) setQuoteResult({ url: quoteUrl, error: (err as Error).message });
        });
    load();
    const timer = setInterval(load, QUOTE_REFRESH_MS);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [quoteUrl]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchJson<History>(historyUrl, ctrl.signal)
      .then((data) => setHistoryResult({ url: historyUrl, data }))
      .catch((err) => {
        if (!ctrl.signal.aborted) setHistoryResult({ url: historyUrl, error: (err as Error).message });
      });
    return () => ctrl.abort();
  }, [historyUrl]);

  const quoteCurrent = quoteResult?.url === quoteUrl ? quoteResult : null;
  const quote = quoteCurrent?.data ?? null;
  const historyLoading = historyResult?.url !== historyUrl;
  // 換區間時保留同一檔股票的舊圖，蓋一層半透明；換股票就顯示骨架
  const history = historyResult?.data?.stockId === stockId ? historyResult.data : null;
  const historyError = historyLoading ? null : (historyResult?.error ?? null);

  const stats: [string, string][] = quote
    ? [
        ["開盤", fmtPrice(quote.open)],
        ["最高", fmtPrice(quote.high)],
        ["最低", fmtPrice(quote.low)],
        ["昨收", fmtPrice(quote.previousClose)],
        ["成交量", `${fmtInt(quote.volume)} 張`],
      ]
    : [];

  return (
    <Card className="flex flex-col">
      {/* 報價區 */}
      <div className="flex flex-col gap-5 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{quote?.name ?? stockName}</h2>
              <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">{stockId}</span>
              {quote && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                    quote.realtime ? "bg-up-soft text-up" : "bg-surface-2 text-muted"
                  }`}
                >
                  {quote.realtime ? "盤中即時" : "收盤價"}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-subtle">{quote ? `資料時間 ${quote.time}` : " "}</p>
          </div>
          <Segmented label="資料來源" options={SOURCES} value={source} onChange={setSource} />
        </div>

        {quoteCurrent?.error ? (
          <p className="rounded-lg bg-up-soft px-3 py-2 text-sm text-up">報價載入失敗：{quoteCurrent.error}</p>
        ) : !quote ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-11 w-56" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <span className="font-mono text-[44px] font-semibold leading-none tracking-tight tabular-nums">
                {fmtPrice(quote.price)}
              </span>
              <span className="pb-1">
                <Delta change={quote.change} percent={quote.changePercent} />
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-y-3 rounded-xl bg-surface-2 px-4 py-3 sm:grid-cols-5">
              {stats.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] text-subtle">{label}</dt>
                  <dd className="truncate font-mono text-sm font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>

      {/* K 線 */}
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-line px-5 pt-4 sm:px-6">
        <h3 className="text-[13px] font-semibold">日 K 線</h3>
        <Segmented label="區間" options={RANGES} value={months} onChange={setMonths} />
      </div>
      <div className="relative px-3 pb-4 pt-3 sm:px-4">
        {historyError ? (
          <p className="flex h-[420px] items-center justify-center text-sm text-up">線圖載入失敗：{historyError}</p>
        ) : history ? (
          <div className={`transition-opacity ${historyLoading ? "opacity-40" : ""}`}>
            <PriceChart candles={history.candles} />
          </div>
        ) : (
          <Skeleton className="h-[420px] w-full" />
        )}
      </div>
    </Card>
  );
}
