import type { NextRequest } from "next/server";
import { isPlausibleKey, listChatModels } from "@/lib/ai/openai";
import { respond } from "@/lib/stock/route-helpers";

/**
 * GET /api/ai/models   Header: X-OpenAI-Key
 * 驗證 key 並列出可用的對話模型（設定頁用）
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-openai-key");
  if (!isPlausibleKey(apiKey)) {
    return Response.json({ error: "API key 格式不正確（應以 sk- 開頭）" }, { status: 400 });
  }
  return respond(() => listChatModels(apiKey));
}
