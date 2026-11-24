import type { NextRequest } from "next/server";
import { getFinMindChips } from "@/lib/stock/finmind";
import { badStockId, respond } from "@/lib/stock/route-helpers";

// GET /api/finmind/2330/chips?days=20
export async function GET(req: NextRequest, ctx: RouteContext<"/api/finmind/[stockId]/chips">) {
  const { stockId } = await ctx.params;
  const n = Number(req.nextUrl.searchParams.get("days") ?? 20);
  const days = Number.isInteger(n) && n >= 5 && n <= 120 ? n : 20;
  return badStockId(stockId) ?? respond(() => getFinMindChips(stockId, days));
}
