export type Source = "twse" | "finmind";

export interface Quote {
  source: Source;
  stockId: string;
  name: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  /** 成交量（張） */
  volume: number | null;
  /** 資料時間，例如 2026-11-24 12:54:00 */
  time: string;
  /** true = 盤中即時；false = 最近一個交易日收盤 */
  realtime: boolean;
}

export interface Candle {
  /** YYYY-MM-DD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** 成交量（張） */
  volume: number;
}

export interface History {
  source: Source;
  stockId: string;
  candles: Candle[];
}

/** 單日籌碼資料；買賣超、融資融券單位都是「張」，null 表示當天該項資料缺漏 */
export interface ChipDay {
  date: string;
  /** 外資（含外資自營商）買賣超 */
  foreignNet: number | null;
  /** 投信買賣超 */
  trustNet: number | null;
  /** 自營商（自行買賣 + 避險）買賣超 */
  dealerNet: number | null;
  /** 三大法人合計買賣超 */
  totalNet: number | null;
  /** 融資餘額 */
  marginBalance: number | null;
  /** 融資增減（今日餘額 - 昨日餘額） */
  marginChange: number | null;
  /** 融券餘額 */
  shortBalance: number | null;
  /** 融券增減 */
  shortChange: number | null;
  /** 外資持股比例 % */
  foreignRatio: number | null;
}

export interface Chips {
  source: "finmind";
  stockId: string;
  /** 由舊到新 */
  days: ChipDay[];
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
