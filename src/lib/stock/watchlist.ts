import "server-only";
import { connectDb } from "@/lib/db";
import { WatchlistItem } from "@/models/WatchlistItem";
import { findListedStock } from "./twse";
import { UpstreamError } from "./types";
import { isValidStockId } from "./utils";

export interface WatchlistEntry {
  stockId: string;
  name: string;
  addedAt: string;
}

export const MAX_WATCHLIST = 20;

function toEntry(doc: { stockId: string; name: string; createdAt?: Date }): WatchlistEntry {
  return { stockId: doc.stockId, name: doc.name, addedAt: (doc.createdAt ?? new Date()).toISOString() };
}

/** 依加入順序排列 */
export async function listWatchlist(): Promise<WatchlistEntry[]> {
  await connectDb();
  const docs = await WatchlistItem.find().sort({ createdAt: 1 }).lean();
  return docs.map(toEntry);
}

export async function addToWatchlist(rawId: string): Promise<WatchlistEntry> {
  const stockId = rawId.trim().toUpperCase();
  if (!isValidStockId(stockId)) throw new UpstreamError(`股票代號格式錯誤：${rawId}`, 400);

  // 用證交所 OpenAPI 確認是上市股票並取得名稱（目前報價只支援上市）
  const stock = await findListedStock(stockId);
  if (!stock) throw new UpstreamError(`找不到上市股票 ${stockId}（目前只支援上市股票與 ETF）`, 404);

  await connectDb();
  if ((await WatchlistItem.countDocuments()) >= MAX_WATCHLIST) {
    throw new UpstreamError(`追蹤清單最多 ${MAX_WATCHLIST} 檔`, 400);
  }
  try {
    const doc = await WatchlistItem.create({ stockId, name: stock.name });
    return toEntry(doc);
  } catch (err) {
    // 11000 = unique index 重複
    if ((err as { code?: number }).code === 11000) {
      throw new UpstreamError(`${stockId} ${stock.name} 已在追蹤清單中`, 409);
    }
    throw err;
  }
}

export async function removeFromWatchlist(rawId: string): Promise<void> {
  const stockId = rawId.trim().toUpperCase();
  await connectDb();
  const { deletedCount } = await WatchlistItem.deleteOne({ stockId });
  if (deletedCount === 0) throw new UpstreamError(`${stockId} 不在追蹤清單中`, 404);
}
