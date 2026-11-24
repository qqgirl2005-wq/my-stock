"use client";

import { type ReactNode, useEffect, useState } from "react";
import { fmtCompact, fmtInt, fmtSigned, toneText } from "@/lib/format";
import type { ChipDay, Chips } from "@/lib/stock/types";
import ChipsChart from "./ChipsChart";
import { Card, CardHeader, Segmented, Skeleton } from "./ui";

const RANGES = [
  { value: 10, label: "10日" },
  { value: 20, label: "20日" },
  { value: 60, label: "60日" },
];

type NetField = "foreignNet" | "trustNet" | "dealerNet" | "totalNet";
type Result = { url: string; data?: Chips; error?: string };

/** 連續買超/賣超天數（從最新一天往回數） */
function streak(days: ChipDay[], key: NetField) {
  const latest = days.at(-1)?.[key];
  if (!latest) return 0;
  let count = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const v = days[i][key];
    if (v === null || Math.sign(v) !== Math.sign(latest)) break;
    count++;
  }
  return count;
}

function NetStat({ label, days, field }: { label: string; days: ChipDay[]; field: NetField }) {
  const latest = days.at(-1)?.[field] ?? null;
  const sum = days.reduce((acc, d) => acc + (d[field] ?? 0), 0);
  const n = streak(days, field);
  return (
    <div className="min-w-0 bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        {n > 1 && latest ? (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              latest > 0 ? "bg-up-soft text-up" : "bg-down-soft text-down"
            }`}
          >
            連{latest > 0 ? "買" : "賣"} {n} 日
          </span>
        ) : null}
      </div>
      <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${toneText(latest)}`}>{fmtSigned(latest)}</div>
      <div className="mt-0.5 text-[11px] text-subtle">
        區間累計 <span className={`font-mono ${toneText(sum)}`}>{fmtCompact(sum)}</span>
      </div>
    </div>
  );
}

function BalanceStat({ label, value, change }: { label: string; value: string; change: ReactNode }) {
  return (
    <div className="min-w-0 bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] text-subtle">{change}</div>
    </div>
  );
}

export default function ChipsPanel({ stockId }: { stockId: string }) {
  const [days, setDays] = useState(20);
  const url = `/api/finmind/${stockId}/chips?days=${days}`;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setResult({ url, data: body as Chips });
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) setResult({ url, error: (err as Error).message });
      });
    return () => ctrl.abort();
  }, [url]);

  const loading = result?.url !== url;
  const chips = result?.data?.stockId === stockId ? result.data : null;
  const error = loading ? null : (result?.error ?? null);
  const latest = chips?.days.at(-1);
  const first = chips?.days[0];
  const ratioDiff =
    latest?.foreignRatio != null && first?.foreignRatio != null ? latest.foreignRatio - first.foreignRatio : null;

  return (
    <Card>
      <CardHeader
        title="籌碼面"
        subtitle={`FinMind・單位：張${latest ? `・資料日 ${latest.date}` : ""}`}
        actions={<Segmented label="籌碼區間" options={RANGES} value={days} onChange={setDays} />}
      />

      <div className="p-5 sm:p-6">
        {error ? (
          <p className="py-10 text-center text-sm text-up">籌碼資料載入失敗：{error}</p>
        ) : !chips ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-[240px] w-full" />
          </div>
        ) : (
          <div className={`flex flex-col gap-6 transition-opacity ${loading ? "opacity-40" : ""}`}>
            <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
              {/* 三大法人 */}
              <div>
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">三大法人買賣超・最新一日</h3>
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
                  <NetStat label="外資" days={chips.days} field="foreignNet" />
                  <NetStat label="投信" days={chips.days} field="trustNet" />
                  <NetStat label="自營商" days={chips.days} field="dealerNet" />
                  <NetStat label="合計" days={chips.days} field="totalNet" />
                </div>
              </div>
              {/* 信用交易、外資持股 */}
              <div>
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">信用交易・外資持股</h3>
                <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
                  <BalanceStat
                    label="融資餘額"
                    value={fmtInt(latest?.marginBalance)}
                    change={<>今日 <span className={`font-mono ${toneText(latest?.marginChange)}`}>{fmtSigned(latest?.marginChange)}</span></>}
                  />
                  <BalanceStat
                    label="融券餘額"
                    value={fmtInt(latest?.shortBalance)}
                    change={<>今日 <span className={`font-mono ${toneText(latest?.shortChange)}`}>{fmtSigned(latest?.shortChange)}</span></>}
                  />
                  <BalanceStat
                    label="外資持股"
                    value={latest?.foreignRatio != null ? `${latest.foreignRatio.toFixed(2)}%` : "—"}
                    change={<>區間 <span className={`font-mono ${toneText(ratioDiff)}`}>{fmtSigned(ratioDiff, 2)}%</span></>}
                  />
                </div>
              </div>
            </div>

            <ChipsChart days={chips.days} />

            {/* 每日明細 */}
            <div className="thin-scroll max-h-[360px] overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[680px] text-right text-[13px]">
                <thead className="sticky top-0 bg-surface-2 text-[11px] text-muted">
                  <tr>
                    {["日期", "外資", "投信", "自營商", "合計", "融資餘額", "融券餘額", "外資持股"].map((h, i) => (
                      <th key={h} className={`px-3 py-2 font-medium ${i === 0 ? "text-left" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {[...chips.days].reverse().map((d) => (
                    <tr key={d.date} className="border-t border-line transition-colors hover:bg-surface-2/60">
                      <td className="px-3 py-2 text-left text-muted">{d.date.slice(5).replace("-", "/")}</td>
                      <td className={`px-3 py-2 ${toneText(d.foreignNet)}`}>{fmtSigned(d.foreignNet)}</td>
                      <td className={`px-3 py-2 ${toneText(d.trustNet)}`}>{fmtSigned(d.trustNet)}</td>
                      <td className={`px-3 py-2 ${toneText(d.dealerNet)}`}>{fmtSigned(d.dealerNet)}</td>
                      <td className={`px-3 py-2 font-semibold ${toneText(d.totalNet)}`}>{fmtSigned(d.totalNet)}</td>
                      <td className="px-3 py-2">{fmtInt(d.marginBalance)}</td>
                      <td className="px-3 py-2">{fmtInt(d.shortBalance)}</td>
                      <td className="px-3 py-2">{d.foreignRatio != null ? `${d.foreignRatio.toFixed(2)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
