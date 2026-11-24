"use client";

import { useCallback, useState } from "react";
import type { AiAnalysis } from "@/lib/ai/analyze";
import type { AiSettings } from "@/lib/ai-settings";

export type AnalysisState =
  | { status: "loading" }
  | { status: "done"; data: AiAnalysis }
  | { status: "error"; error: string };

/**
 * AI 分析狀態，依股票代號保存，讓卡片上的按鈕和 AI 面板共用同一份結果
 * （每次分析都會花使用者的 OpenAI 額度，所以結果留著，切換股票不會重跑）
 */
export function useAiAnalysis(settings: AiSettings | null) {
  const [states, setStates] = useState<Record<string, AnalysisState>>({});

  const analyze = useCallback(
    async (stockId: string) => {
      if (!settings) return;
      setStates((s) => ({ ...s, [stockId]: { status: "loading" } }));
      try {
        const res = await fetch("/api/ai/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-OpenAI-Key": settings.apiKey },
          body: JSON.stringify({ stockId, model: settings.model }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setStates((s) => ({ ...s, [stockId]: { status: "done", data: body as AiAnalysis } }));
      } catch (err) {
        setStates((s) => ({ ...s, [stockId]: { status: "error", error: (err as Error).message } }));
      }
    },
    [settings],
  );

  return { states, analyze };
}

export const SENTIMENT = {
  bullish: { label: "偏多", className: "bg-up-soft text-up", bar: "bg-up" },
  bearish: { label: "偏空", className: "bg-down-soft text-down", bar: "bg-down" },
  neutral: { label: "中性", className: "bg-surface-2 text-muted", bar: "bg-subtle" },
} as const;
