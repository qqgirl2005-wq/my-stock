"use client";

import type { AiAnalysis } from "@/lib/ai/analyze";
import type { AiSettings } from "@/lib/ai-settings";
import { type AnalysisState, SENTIMENT } from "@/lib/use-ai-analysis";
import { Card, CardHeader, Skeleton } from "./ui";

function PointList({ title, points, tone }: { title: string; points: string[]; tone: "up" | "down" | "muted" }) {
  if (points.length === 0) return null;
  const dot = tone === "up" ? "bg-up" : tone === "down" ? "bg-down" : "bg-subtle";
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
            <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AiAnalysisPanel({
  stockName,
  settings,
  state,
  onAnalyze,
  onOpenSettings,
}: {
  stockName: string;
  settings: AiSettings | null;
  state: AnalysisState | undefined;
  onAnalyze: () => void;
  onOpenSettings: () => void;
}) {
  const loading = state?.status === "loading";
  const analyze = () => (settings ? onAnalyze() : onOpenSettings());

  return (
    <Card className="scroll-mt-24" id="ai-panel">
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-accent" aria-hidden>
              <path d="M8 1.5l1.6 4.2 4.4.3-3.4 2.8 1.1 4.3L8 10.7l-3.7 2.4 1.1-4.3L2 6l4.4-.3z" fill="currentColor" />
            </svg>
            AI 多空分析
          </span>
        }
        subtitle={settings ? `OpenAI・${settings.model}` : "使用你自己的 OpenAI API key"}
        actions={
          <button
            onClick={analyze}
            disabled={loading}
            className="rounded-lg bg-fg px-3 py-1.5 text-xs font-medium text-bg transition disabled:opacity-40"
          >
            {!settings ? "設定 API key" : loading ? "分析中…" : state?.status === "done" ? "重新分析" : `分析 ${stockName}`}
          </button>
        }
      />

      <div className="px-5 pb-5 pt-4 sm:px-6">
        {!settings && !state ? (
          <p className="rounded-xl bg-surface-2 px-4 py-3 text-xs leading-relaxed text-muted">
            AI 會讀取這檔股票的即時報價、近 3 個月走勢、近 20 日籌碼與最新新聞，判斷短期偏多或偏空並說明原因。
            請先點「設定 API key」輸入你的 OpenAI key。
          </p>
        ) : !state ? (
          <p className="rounded-xl bg-surface-2 px-4 py-3 text-xs leading-relaxed text-muted">
            點「分析」讓 AI 整合報價、走勢、籌碼與新聞，給出多空判斷。每次分析會使用你的 OpenAI 額度。
          </p>
        ) : state.status === "loading" ? (
          <div className="flex flex-col gap-3" aria-live="polite">
            <p className="text-xs text-muted">正在整理資料並請 AI 分析，約需 10～30 秒…</p>
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : state.status === "error" ? (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="rounded-lg bg-up-soft px-3 py-2 text-xs text-up">分析失敗：{state.error}</p>
            {/key|設定|模型/.test(state.error) && (
              <button onClick={onOpenSettings} className="text-xs text-accent hover:underline">
                開啟設定
              </button>
            )}
          </div>
        ) : (
          <Result data={state.data} />
        )}
      </div>
    </Card>
  );
}

function Result({ data }: { data: AiAnalysis }) {
  const s = SENTIMENT[data.sentiment];
  return (
    <div className="flex flex-col gap-5" aria-live="polite">
      <div className="flex items-center gap-4">
        <span className={`rounded-xl px-3.5 py-2 text-lg font-semibold ${s.className}`}>{s.label}</span>
        <div className="flex-1">
          <div className="flex justify-between text-[11px] text-muted">
            <span>信心程度</span>
            <span className="font-mono">{data.confidence}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${data.confidence}%` }} />
          </div>
        </div>
      </div>

      <p className="text-sm leading-relaxed">{data.summary}</p>

      <PointList title="利多因素" points={data.bullishPoints} tone="up" />
      <PointList title="利空因素" points={data.bearishPoints} tone="down" />
      <PointList title="後續觀察" points={data.watchItems} tone="muted" />

      <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-subtle">
        {new Date(data.generatedAt).toLocaleString("zh-TW", { hour12: false })} 產生・
        參考報價 {data.basis.quoteTime ?? "—"}、籌碼 {data.basis.chipsDate ?? "—"}、新聞 {data.basis.newsCount} 則
        {data.basis.missing.length > 0 && `・缺少：${data.basis.missing.join("、")}`}
        <br />
        AI 產生的內容可能有誤，僅供參考，不構成投資建議。
      </p>
    </div>
  );
}
