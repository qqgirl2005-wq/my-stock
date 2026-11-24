import { cached } from "./cache";
import { type Candle, type ChipDay, type Chips, type History, type Quote, UpstreamError } from "./types";
import { monthsAgo, round } from "./utils";

const BASE = "https://api.finmindtrade.com/api/v4/data";

interface FinMindResponse<T> {
  msg: string;
  status: number;
  data?: T[];
}

interface PriceRow {
  date: string;
  stock_id: string;
  Trading_Volume: number; // 股
  open: number;
  max: number;
  min: number;
  close: number;
  spread: number; // 漲跌
}

interface StockInfoRow {
  stock_id: string;
  stock_name: string;
}

async function request<T>(params: Record<string, string>): Promise<T[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  // token 可不帶；有帶的話額度較高。只放在伺服器端環境變數，不會送到瀏覽器
  const token = process.env.FINMIND_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}?${new URLSearchParams(params)}`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new UpstreamError(`無法連線到 FinMind：${(err as Error).message}`);
  }

  const body = (await res.json().catch(() => null)) as FinMindResponse<T> | null;
  if (!res.ok || !body || body.status !== 200) {
    // 402 = 超過額度；FinMind 對大量錯誤請求會封 IP，所以這裡不重試
    const status = res.status === 402 ? 429 : 502;
    throw new UpstreamError(`FinMind 錯誤：${body?.msg ?? `HTTP ${res.status}`}`, status);
  }
  return body.data ?? [];
}

function toCandle(r: PriceRow): Candle {
  return {
    date: r.date,
    open: r.open,
    high: r.max,
    low: r.min,
    close: r.close,
    volume: Math.round(r.Trading_Volume / 1000),
  };
}

function getStockName(stockId: string): Promise<string> {
  return cached(`finmind:name:${stockId}`, 24 * 60 * 60_000, async () => {
    const rows = await request<StockInfoRow>({ dataset: "TaiwanStockInfo", data_id: stockId });
    return rows[0]?.stock_name ?? stockId;
  });
}

function getPrices(stockId: string, startDate: string): Promise<PriceRow[]> {
  return cached(`finmind:price:${stockId}:${startDate}`, 10 * 60_000, () =>
    request<PriceRow>({ dataset: "TaiwanStockPrice", data_id: stockId, start_date: startDate }),
  );
}

/** FinMind 免費方案沒有盤中即時價，這裡回傳最近一個交易日的收盤 */
export async function getFinMindQuote(stockId: string): Promise<Quote> {
  const [rows, name] = await Promise.all([
    getPrices(stockId, monthsAgo(1)),
    getStockName(stockId).catch(() => stockId),
  ]);
  const last = rows.at(-1);
  if (!last) throw new UpstreamError(`FinMind 查無 ${stockId} 的股價`, 404);

  const previousClose = round(last.close - last.spread);
  return {
    source: "finmind",
    stockId,
    name,
    price: last.close,
    previousClose,
    change: last.spread,
    changePercent: previousClose ? round((last.spread / previousClose) * 100) : null,
    open: last.open,
    high: last.max,
    low: last.min,
    volume: Math.round(last.Trading_Volume / 1000),
    time: last.date,
    realtime: false,
  };
}

export async function getFinMindHistory(stockId: string, months: number): Promise<History> {
  const rows = await getPrices(stockId, monthsAgo(months));
  // 停牌日 FinMind 會給 0，略過
  const candles = rows.filter((r) => r.close > 0).map(toCandle);
  if (candles.length === 0) throw new UpstreamError(`FinMind 查無 ${stockId} 的歷史資料`, 404);
  return { source: "finmind", stockId, candles };
}

/* ---------------- 籌碼面 ---------------- */
// 以下三個資料集 Free 等級可用。注意：分點進出、股權分散表、八大行庫、逐筆成交需要 sponsor，
// 打了會回 400，而 FinMind 對大量 4xx 會封 IP，所以不要隨便加。

interface InstitutionalRow {
  date: string;
  name: "Foreign_Investor" | "Foreign_Dealer_Self" | "Investment_Trust" | "Dealer_self" | "Dealer_Hedging" | string;
  buy: number; // 股
  sell: number; // 股
}

interface MarginRow {
  date: string;
  MarginPurchaseTodayBalance: number; // 張
  MarginPurchaseYesterdayBalance: number;
  ShortSaleTodayBalance: number; // 張
  ShortSaleYesterdayBalance: number;
}

interface ShareholdingRow {
  date: string;
  ForeignInvestmentSharesRatio: number;
}

const FOREIGN = new Set(["Foreign_Investor", "Foreign_Dealer_Self"]);
const DEALER = new Set(["Dealer_self", "Dealer_Hedging"]);

/** 往回抓 days 個交易日的籌碼（三大法人、融資融券、外資持股），同一請求快取 10 分鐘 */
export function getFinMindChips(stockId: string, days: number): Promise<Chips> {
  return cached(`finmind:chips:${stockId}:${days}`, 10 * 60_000, async () => {
    // 交易日約佔日曆日 2/3，多抓一些再截取
    const start = new Date();
    start.setDate(start.getDate() - Math.ceil(days * 1.6) - 7);
    const params = { data_id: stockId, start_date: start.toISOString().slice(0, 10) };

    const [institutional, margin, shareholding] = await Promise.all([
      request<InstitutionalRow>({ dataset: "TaiwanStockInstitutionalInvestorsBuySell", ...params }),
      request<MarginRow>({ dataset: "TaiwanStockMarginPurchaseShortSale", ...params }),
      request<ShareholdingRow>({ dataset: "TaiwanStockShareholding", ...params }),
    ]);

    const byDate = new Map<string, ChipDay>();
    const day = (date: string) => {
      let d = byDate.get(date);
      if (!d) {
        d = {
          date,
          foreignNet: null,
          trustNet: null,
          dealerNet: null,
          totalNet: null,
          marginBalance: null,
          marginChange: null,
          shortBalance: null,
          shortChange: null,
          foreignRatio: null,
        };
        byDate.set(date, d);
      }
      return d;
    };
    const add = (a: number | null, b: number) => (a ?? 0) + b;

    for (const r of institutional) {
      const d = day(r.date);
      const net = (r.buy - r.sell) / 1000;
      if (FOREIGN.has(r.name)) d.foreignNet = add(d.foreignNet, net);
      else if (r.name === "Investment_Trust") d.trustNet = add(d.trustNet, net);
      else if (DEALER.has(r.name)) d.dealerNet = add(d.dealerNet, net);
      else continue;
      d.totalNet = add(d.totalNet, net);
    }
    for (const r of margin) {
      const d = day(r.date);
      d.marginBalance = r.MarginPurchaseTodayBalance;
      d.marginChange = r.MarginPurchaseTodayBalance - r.MarginPurchaseYesterdayBalance;
      d.shortBalance = r.ShortSaleTodayBalance;
      d.shortChange = r.ShortSaleTodayBalance - r.ShortSaleYesterdayBalance;
    }
    for (const r of shareholding) day(r.date).foreignRatio = r.ForeignInvestmentSharesRatio;

    const all = [...byDate.values()]
      .map((d) => ({
        ...d,
        // 股數換算成張後四捨五入（零股會產生小數）
        foreignNet: d.foreignNet === null ? null : Math.round(d.foreignNet),
        trustNet: d.trustNet === null ? null : Math.round(d.trustNet),
        dealerNet: d.dealerNet === null ? null : Math.round(d.dealerNet),
        totalNet: d.totalNet === null ? null : Math.round(d.totalNet),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (all.length === 0) throw new UpstreamError(`FinMind 查無 ${stockId} 的籌碼資料`, 404);
    return { source: "finmind", stockId, days: all.slice(-days) };
  });
}
