"use client";

import { useEffect, useState } from "react";
import type { News } from "@/lib/stock/news";
import { Card, CardHeader, Skeleton } from "./ui";

const REFRESH_MS = 5 * 60_000;

type Result = { url: string; data?: News; error?: string };

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  return new Date(iso).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
}

export default function NewsPanel({ stockId, stockName }: { stockId: string; stockName: string }) {
  const url = `/api/news/${stockId}`;
  const [result, setResult] = useState<Result | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const ctrl = new AbortController();
    const load = () =>
      fetch(url, { signal: ctrl.signal, cache: "no-store" })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
          setResult({ url, data: body as News });
          setNow(Date.now());
        })
        .catch((err) => {
          if (!ctrl.signal.aborted) setResult({ url, error: (err as Error).message });
        });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [url]);

  const current = result?.url === url ? result : null;
  const items = current?.data?.items ?? [];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="相關新聞"
        subtitle={`${stockName}・Yahoo 股市・每 5 分鐘更新`}
        actions={items.length > 0 ? <span className="font-mono text-xs text-subtle">{items.length} 則</span> : null}
      />

      {/* 桌機與左邊卡片同高、內部捲動；手機最多顯示一段高度 */}
      <div className="thin-scroll mt-3 max-h-[560px] min-h-0 flex-1 overflow-y-auto px-2 pb-3 lg:max-h-none lg:basis-0">
        {!current ? (
          <div className="flex flex-col gap-2 px-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : current.error ? (
          <p className="py-10 text-center text-sm text-up">新聞載入失敗：{current.error}</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">目前沒有相關新聞</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.link}>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-1 rounded-xl px-3 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-accent">
                    {item.title}
                  </span>
                  {item.summary && <span className="line-clamp-1 text-xs text-muted">{item.summary}</span>}
                  <span className="flex items-center gap-1 text-[11px] text-subtle">
                    {timeAgo(item.publishedAt, now)}
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 opacity-0 transition group-hover:opacity-100" aria-hidden>
                      <path d="M4 2h6v6M10 2L3 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
