import type { NextRequest } from "next/server";
import { respond } from "@/lib/stock/route-helpers";
import { addToWatchlist, listWatchlist } from "@/lib/stock/watchlist";

// GET /api/watchlist  取得追蹤清單
export async function GET() {
  return respond(() => listWatchlist());
}

// POST /api/watchlist  body: { "stockId": "2330" }  加入追蹤清單
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { stockId?: unknown } | null;
  if (typeof body?.stockId !== "string") {
    return Response.json({ error: "請提供 stockId" }, { status: 400 });
  }
  const stockId = body.stockId;
  return respond(() => addToWatchlist(stockId), 201);
}
