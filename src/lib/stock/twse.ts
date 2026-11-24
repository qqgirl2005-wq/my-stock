import { cached } from "./cache";
import { type Candle, type History, type Quote, UpstreamError } from "./types";
import { monthsAgo, rocToIso, round, toNumber } from "./utils";

const OPENAPI_BASE = "https://openapi.twse.com.tw/v1";
const MIS_BASE = "https://mis.twse.com.tw/stock/api";
const REPORT_BASE = "https://www.twse.com.tw/rwd/zh/afterTrading";

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new UpstreamError(`無法連線到證交所：${(err as Error).message}`);
  }
  if (!res.ok) throw new UpstreamError(`證交所回應 HTTP ${res.status}`);
  return (await res.json()) as T;
}

/* ---------------- 即時報價（mis.twse.com.tw） ---------------- */

interface MisStock {
  c: string; // 代號
  n: string; // 名稱
  z: string; // 最新成交價（無成交時為 "-"）
  y: string; // 昨收
  o: string;
  h: string;
  l: string;
  v: string; // 累積成交量（張）
  b: string; // 最佳五檔買價，以 _ 分隔
  a: string; // 最佳五檔賣價
  d: string; // YYYYMMDD
  t: string; // HH:mm:ss
  trade?: { z?: string };
}

/** 一次請求抓多檔即時報價（用 | 串接），回傳 代號 → 報價 */
async function fetchRealtimeQuotes(stockIds: string[]): Promise<Map<string, Quote>> {
  const exCh = stockIds.map((id) => `tse_${id}.tw`).join("|");
  const data = await getJson<{ msgArray?: MisStock[] }>(
    `${MIS_BASE}/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0`,
  );
  const result = new Map<string, Quote>();
  for (const s of data.msgArray ?? []) {
    const q = parseMisStock(s);
    if (q) result.set(q.stockId, q);
  }
  return result;
}

function parseMisStock(s: MisStock): Quote | null {
  const firstOf = (list: string) => toNumber(list?.split("_")[0]);
  // z 在兩筆撮合之間常是 "-"，依序退回最後一筆成交、最佳買價、最佳賣價
  const price =
    toNumber(s.z) ?? toNumber(s.trade?.z) ?? firstOf(s.b) ?? firstOf(s.a) ?? toNumber(s.y);
  if (price === null || price === 0) return null;

  const previousClose = toNumber(s.y);
  const change = previousClose ? round(price - previousClose) : null;
  return {
    source: "twse",
    stockId: s.c,
    name: s.n,
    price,
    previousClose,
    change,
    changePercent: previousClose && change !== null ? round((change / previousClose) * 100) : null,
    open: toNumber(s.o),
    high: toNumber(s.h),
    low: toNumber(s.l),
    volume: toNumber(s.v),
    time: `${s.d.slice(0, 4)}-${s.d.slice(4, 6)}-${s.d.slice(6, 8)} ${s.t}`,
    realtime: true,
  };
}

/* ---------------- 最近收盤（TWSE OpenAPI） ---------------- */

interface OpenApiDayRow {
  Date: string;
  Code: string;
  Name: string;
  TradeVolume: string;
  OpeningPrice: string;
  HighestPrice: string;
  LowestPrice: string;
  ClosingPrice: string;
  Change: string;
}

/** 全市場最近一個交易日行情，資料一天才更新一次，快取 10 分鐘 */
function fetchStockDayAll() {
  return cached("twse:STOCK_DAY_ALL", 10 * 60_000, () =>
    getJson<OpenApiDayRow[]>(`${OPENAPI_BASE}/exchangeReport/STOCK_DAY_ALL`),
  );
}

/** 查上市股票（含 ETF）是否存在，存在就回傳代號與名稱 */
export async function findListedStock(stockId: string): Promise<{ stockId: string; name: string } | null> {
  const row = (await fetchStockDayAll()).find((r) => r.Code === stockId);
  return row ? { stockId: row.Code, name: row.Name } : null;
}

async function fetchOpenApiQuote(stockId: string): Promise<Quote> {
  const rows = await fetchStockDayAll();
  const row = rows.find((r) => r.Code === stockId);
  if (!row) throw new UpstreamError(`證交所 OpenAPI 查無股票 ${stockId}`, 404);

  const price = toNumber(row.ClosingPrice);
  if (price === null) throw new UpstreamError(`${stockId} 最近交易日無收盤價`, 404);
  const change = toNumber(row.Change);
  const previousClose = change !== null ? round(price - change) : null;
  const shares = toNumber(row.TradeVolume);

  return {
    source: "twse",
    stockId: row.Code,
    name: row.Name,
    price,
    previousClose,
    change,
    changePercent: previousClose && change !== null ? round((change / previousClose) * 100) : null,
    open: toNumber(row.OpeningPrice),
    high: toNumber(row.HighestPrice),
    low: toNumber(row.LowestPrice),
    volume: shares !== null ? Math.round(shares / 1000) : null,
    time: rocToIso(row.Date),
    realtime: false,
  };
}

/** 先拿盤中即時價，拿不到（非交易時段、即時端點掛掉）就用 OpenAPI 最近收盤 */
export async function getTwseQuote(stockId: string): Promise<Quote> {
  const [quote] = await getTwseQuotes([stockId]);
  if ("error" in quote) throw new UpstreamError(quote.error, 404);
  return quote;
}

export type QuoteOrError = Quote | { stockId: string; error: string };

/** 多檔報價：即時價一次請求抓完，個別拿不到的再用 OpenAPI 最近收盤補 */
export function getTwseQuotes(stockIds: string[]): Promise<QuoteOrError[]> {
  return cached(`twse:quotes:${stockIds.join(",")}`, 5_000, async () => {
    let realtime = new Map<string, Quote>();
    try {
      realtime = await fetchRealtimeQuotes(stockIds);
    } catch {
      // 即時端點不是正式 API，失敗就全部退回 OpenAPI
    }
    return Promise.all(
      stockIds.map(async (id): Promise<QuoteOrError> => {
        const q = realtime.get(id);
        if (q) return q;
        try {
          return await fetchOpenApiQuote(id);
        } catch (err) {
          return { stockId: id, error: (err as Error).message };
        }
      }),
    );
  });
}

/* ---------------- 歷史日 K（證交所個股月成交資訊） ---------------- */

interface StockDayReport {
  stat: string;
  data?: string[][]; // [日期, 成交股數, 成交金額, 開, 高, 低, 收, 漲跌, 筆數, 註記]
}

function fetchMonth(stockId: string, yyyymm: string, isCurrentMonth: boolean): Promise<Candle[]> {
  // 本月資料每天會增加，快取短一點；過去的月份不會變
  const ttl = isCurrentMonth ? 10 * 60_000 : 24 * 60 * 60_000;
  return cached(`twse:month:${stockId}:${yyyymm}`, ttl, async () => {
    const report = await getJson<StockDayReport>(
      `${REPORT_BASE}/STOCK_DAY?date=${yyyymm}01&stockNo=${stockId}&response=json`,
    );
    if (report.stat !== "OK" || !report.data) return [];

    return report.data.flatMap((row) => {
      const [date, shares, , open, high, low, close] = row;
      const o = toNumber(open), h = toNumber(high), l = toNumber(low), c = toNumber(close);
      // 停牌日價格為 "--"，略過
      if (o === null || h === null || l === null || c === null) return [];
      return [{ date: rocToIso(date), open: o, high: h, low: l, close: c, volume: Math.round((toNumber(shares) ?? 0) / 1000) }];
    });
  });
}

export async function getTwseHistory(stockId: string, months: number): Promise<History> {
  const now = new Date();
  const candles: Candle[] = [];
  // 證交所對頻繁請求很敏感，逐月依序抓
  // 多抓一個月再依起始日過濾，讓區間跟 FinMind 一致（例如 11/24 往前 3 個月 = 8/24 起）
  for (let i = months; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    candles.push(...(await fetchMonth(stockId, yyyymm, i === 0)));
  }

  const start = monthsAgo(months, now);
  const filtered = candles.filter((c) => c.date >= start);
  if (filtered.length === 0) throw new UpstreamError(`證交所查無 ${stockId} 的歷史資料`, 404);
  return { source: "twse", stockId, candles: filtered };
}
