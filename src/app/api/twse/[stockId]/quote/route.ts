import type { NextRequest } from "next/server";
import { getTwseQuote } from "@/lib/stock/twse";
import { badStockId, respond } from "@/lib/stock/route-helpers";

// GET /api/twse/2330/quote
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/twse/[stockId]/quote">) {
  const { stockId } = await ctx.params;
  return badStockId(stockId) ?? respond(() => getTwseQuote(stockId));
}
