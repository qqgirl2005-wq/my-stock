import type { NextRequest } from "next/server";
import { respond } from "@/lib/stock/route-helpers";
import { removeFromWatchlist } from "@/lib/stock/watchlist";

// DELETE /api/watchlist/2330  從追蹤清單移除
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/watchlist/[stockId]">) {
  const { stockId } = await ctx.params;
  return respond(async () => {
    await removeFromWatchlist(stockId);
    return { ok: true, stockId };
  });
}
