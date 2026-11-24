import "server-only";
import { getFinMindChips } from "@/lib/stock/finmind";
import { getYahooNews } from "@/lib/stock/news";
import { getTwseHistory, getTwseQuote } from "@/lib/stock/twse";
import type { Candle } from "@/lib/stock/types";
import { round } from "@/lib/stock/utils";
import { structuredResponse } from "./openai";

export type Sentiment = "bullish" | "bearish" | "neutral";

export interface AiAnalysis {
  stockId: string;
  name: string;
  model: string;
  generatedAt: string;
  /** 分析時用到的資料時間與缺漏的資料，讓使用者知道 AI 看了什麼 */
  basis: { quoteTime: string | null; chipsDate: string | null; newsCount: number; missing: string[] };
  sentiment: Sentiment;
  /** 0–100 */
  confidence: number;
  summary: string;
  bullishPoints: string[];
  bearishPoints: string[];
  watchItems: string[];
}

type ModelOutput = Pick<AiAnalysis, "sentiment" | "confidence" | "summary" | "bullishPoints" | "bearishPoints" | "watchItems">;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sentiment", "confidence", "summary", "bullishPoints", "bearishPoints", "watchItems"],
  properties: {
    sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"], description: "短期（數日至數週）整體偏多、偏空或中性" },
    confidence: { type: "integer", description: "判斷信心 0-100" },
    summary: { type: "string", description: "兩到三句話的總結" },
    bullishPoints: { type: "array", items: { type: "string" }, description: "利多因素，每點一句並引用具體數據" },
    bearishPoints: { type: "array", items: { type: "string" }, description: "利空因素，每點一句並引用具體數據" },
    watchItems: { type: "array", items: { type: "string" }, description: "接下來值得觀察的指標或事件" },
  },
} as const;

const SYSTEM = `你是嚴謹的台股分析助理。根據使用者提供的「當下資料」判斷這檔股票短期（數日至數週）偏多、偏空或中性，並說明原因。
規則：
- 只能根據提供的資料推論，不要捏造資料中沒有的數字、財報或事件。
- 每個理由都要引用資料裡的具體數字或新聞標題。
- 利多、利空各列 2～5 點；若某方面資料不足就少列，不要硬湊。
- 訊號互相矛盾或資料不足時，選 neutral 並降低 confidence。
- 單位：買賣超、融資融券、成交量都是「張」。
- 全部用繁體中文回答。這是資訊整理，不是投資建議。`;

function pctChange(from: number | undefined, to: number | undefined) {
  return from && to ? round(((to - from) / from) * 100) : null;
}

function ma(candles: Candle[], n: number) {
  if (candles.length < n) return null;
  return round(candles.slice(-n).reduce((s, c) => s + c.close, 0) / n);
}

/** 自己去抓這檔股票目前的資料（不信任前端傳來的數字），整理成精簡的 JSON 給模型 */
async function collectContext(stockId: string) {
  const [quote, history, chips, news] = await Promise.allSettled([
    getTwseQuote(stockId),
    getTwseHistory(stockId, 3),
    getFinMindChips(stockId, 20),
    getYahooNews(stockId),
  ]);

  const missing: string[] = [];
  const ctx: Record<string, unknown> = { stockId };

  if (quote.status === "fulfilled") {
    const q = quote.value;
    ctx.quote = {
      name: q.name,
      time: q.time,
      realtime: q.realtime,
      price: q.price,
      change: q.change,
      changePercent: q.changePercent,
      open: q.open,
      high: q.high,
      low: q.low,
      previousClose: q.previousClose,
      volumeLots: q.volume,
    };
  } else missing.push("即時報價");

  if (history.status === "fulfilled") {
    const c = history.value.candles;
    const last = c.at(-1);
    const avgVol20 = c.length >= 20 ? Math.round(c.slice(-20).reduce((s, x) => s + x.volume, 0) / 20) : null;
    ctx.priceTrend = {
      lastClose: last?.close,
      lastCloseDate: last?.date,
      ma5: ma(c, 5),
      ma20: ma(c, 20),
      ma60: ma(c, 60),
      return5d: pctChange(c.at(-6)?.close, last?.close),
      return20d: pctChange(c.at(-21)?.close, last?.close),
      return3m: pctChange(c[0]?.close, last?.close),
      high3m: Math.max(...c.map((x) => x.high)),
      low3m: Math.min(...c.map((x) => x.low)),
      avgVolume20dLots: avgVol20,
      last10Days: c.slice(-10).map((x) => ({ date: x.date, close: x.close, volume: x.volume })),
    };
  } else missing.push("歷史股價");

  let chipsDate: string | null = null;
  if (chips.status === "fulfilled") {
    const d = chips.value.days;
    chipsDate = d.at(-1)?.date ?? null;
    const sum = (k: "foreignNet" | "trustNet" | "dealerNet") => d.reduce((s, x) => s + (x[k] ?? 0), 0);
    ctx.chips = {
      latestDate: chipsDate,
      sum20d: { foreign: sum("foreignNet"), trust: sum("trustNet"), dealer: sum("dealerNet") },
      foreignRatioChange20d: round((d.at(-1)?.foreignRatio ?? 0) - (d[0]?.foreignRatio ?? 0)),
      last10Days: d.slice(-10),
    };
  } else missing.push("籌碼資料");

  let newsCount = 0;
  if (news.status === "fulfilled") {
    const items = news.value.items.slice(0, 12);
    newsCount = items.length;
    ctx.newsHeadlines = items.map((n) => ({ title: n.title, publishedAt: n.publishedAt, summary: n.summary.slice(0, 80) }));
  } else missing.push("新聞");

  if (!ctx.quote && !ctx.priceTrend) throw new Error(`無法取得 ${stockId} 的股價資料，無法分析`);

  return {
    ctx,
    name: quote.status === "fulfilled" ? quote.value.name : stockId,
    basis: {
      quoteTime: quote.status === "fulfilled" ? quote.value.time : null,
      chipsDate,
      newsCount,
      missing,
    },
  };
}

export async function analyzeStock(stockId: string, apiKey: string, model: string): Promise<AiAnalysis> {
  const { ctx, name, basis } = await collectContext(stockId);

  const out = await structuredResponse<ModelOutput>({
    apiKey,
    model,
    system: SYSTEM,
    user: `請分析 ${name}（${stockId}）。今天是 ${new Date().toISOString().slice(0, 10)}。當下資料如下（JSON）：\n${JSON.stringify(ctx)}`,
    schemaName: "stock_sentiment",
    schema: SCHEMA,
  });

  return {
    stockId,
    name,
    model,
    generatedAt: new Date().toISOString(),
    basis,
    sentiment: out.sentiment,
    confidence: Math.max(0, Math.min(100, Math.round(out.confidence))),
    summary: out.summary,
    bullishPoints: out.bullishPoints,
    bearishPoints: out.bearishPoints,
    watchItems: out.watchItems,
  };
}
