import type { NextRequest } from "next/server";
import { getYahooNews } from "@/lib/stock/news";
import { badStockId, respond } from "@/lib/stock/route-helpers";

// GET /api/news/2330  個股相關新聞（Yahoo 股市 RSS）
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/news/[stockId]">) {
  const { stockId } = await ctx.params;
  return badStockId(stockId) ?? respond(() => getYahooNews(stockId));
}
