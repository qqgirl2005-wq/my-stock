import type { NextRequest } from "next/server";
import { analyzeStock } from "@/lib/ai/analyze";
import { isPlausibleKey } from "@/lib/ai/openai";
import { respond } from "@/lib/stock/route-helpers";
import { isValidStockId } from "@/lib/stock/utils";

/**
 * POST /api/ai/analyze
 * Header: X-OpenAI-Key: sk-...（BYOK，使用者自己的 key；伺服器只拿來轉呼叫 OpenAI，不儲存、不記錄）
 * Body:   { "stockId": "2330", "model": "gpt-..." }
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-openai-key");
  if (!isPlausibleKey(apiKey)) {
    return Response.json({ error: "請先到「設定」輸入 OpenAI API key" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { stockId?: unknown; model?: unknown } | null;
  const stockId = typeof body?.stockId === "string" ? body.stockId.trim().toUpperCase() : "";
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  if (!isValidStockId(stockId)) return Response.json({ error: "股票代號格式錯誤" }, { status: 400 });
  if (!/^[\w.:-]{1,64}$/.test(model)) return Response.json({ error: "請先到「設定」選擇模型" }, { status: 400 });

  return respond(() => analyzeStock(stockId, apiKey, model));
}
