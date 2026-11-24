import type { NextRequest } from "next/server";
import { getFinMindHistory } from "@/lib/stock/finmind";
import { badStockId, respond } from "@/lib/stock/route-helpers";
import { parseMonths } from "@/lib/stock/utils";

// GET /api/finmind/2330/history?months=6
export async function GET(req: NextRequest, ctx: RouteContext<"/api/finmind/[stockId]/history">) {
  const { stockId } = await ctx.params;
  const months = parseMonths(req.nextUrl.searchParams.get("months"));
  return badStockId(stockId) ?? respond(() => getFinMindHistory(stockId, months));
}
