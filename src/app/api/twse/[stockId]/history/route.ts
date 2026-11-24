import type { NextRequest } from "next/server";
import { getTwseHistory } from "@/lib/stock/twse";
import { badStockId, respond } from "@/lib/stock/route-helpers";
import { parseMonths } from "@/lib/stock/utils";

// GET /api/twse/2330/history?months=6
export async function GET(req: NextRequest, ctx: RouteContext<"/api/twse/[stockId]/history">) {
  const { stockId } = await ctx.params;
  const months = parseMonths(req.nextUrl.searchParams.get("months"));
  return badStockId(stockId) ?? respond(() => getTwseHistory(stockId, months));
}
