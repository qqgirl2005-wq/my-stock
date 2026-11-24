import type { NextRequest } from "next/server";
import { getFinMindQuote } from "@/lib/stock/finmind";
import { badStockId, respond } from "@/lib/stock/route-helpers";

// GET /api/finmind/2330/quote
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/finmind/[stockId]/quote">) {
  const { stockId } = await ctx.params;
  return badStockId(stockId) ?? respond(() => getFinMindQuote(stockId));
}
