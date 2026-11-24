import type { NextRequest } from "next/server";
import { getTwseQuotes } from "@/lib/stock/twse";
import { respond } from "@/lib/stock/route-helpers";
import { isValidStockId } from "@/lib/stock/utils";

// GET /api/twse/quotes?ids=2330,2317,2454  一次查多檔（最多 20 檔）
export async function GET(req: NextRequest) {
  const ids = [...new Set((req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0 || ids.length > 20 || !ids.every(isValidStockId)) {
    return Response.json({ error: "ids 需為 1～20 個以逗號分隔的股票代號" }, { status: 400 });
  }
  return respond(() => getTwseQuotes(ids));
}
