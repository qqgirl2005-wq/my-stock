import { cached } from "./cache";
import { UpstreamError } from "./types";

export interface NewsItem {
  title: string;
  link: string;
  /** ISO 8601 */
  publishedAt: string | null;
  summary: string;
}

export interface News {
  source: "yahoo";
  stockId: string;
  items: NewsItem[];
}

const FEED = "https://tw.stock.yahoo.com/rss";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/<[^>]+>/g, "") // 摘要偶爾夾帶 HTML 標籤
    .replace(/\s+/g, " ")
    .trim();
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1].trim()) : "";
}

/** Yahoo 股市 RSS 格式簡單固定，用正規表示式解析即可，不需要額外套件 */
export function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const [, body] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = tag(body, "title");
    const link = tag(body, "link");
    // 只接受 http(s) 連結，避免 javascript: 之類的網址被渲染成連結
    if (!title || !/^https?:\/\//.test(link)) continue;
    const date = new Date(tag(body, "pubDate"));
    items.push({
      title,
      link,
      publishedAt: Number.isNaN(date.getTime()) ? null : date.toISOString(),
      summary: tag(body, "description"),
    });
  }
  return items;
}

/** 個股相關新聞（Yahoo 股市 RSS，s=代號.TW），RSS 的 ttl 是 5 分鐘，快取同樣時間 */
export function getYahooNews(stockId: string): Promise<News> {
  return cached(`yahoo:news:${stockId}`, 5 * 60_000, async () => {
    let res: Response;
    try {
      res = await fetch(`${FEED}?s=${encodeURIComponent(`${stockId}.TW`)}`, {
        cache: "no-store",
        headers: { Accept: "application/rss+xml, application/xml", "User-Agent": "Mozilla/5.0 (my-stock)" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new UpstreamError(`無法連線到 Yahoo 股市：${(err as Error).message}`);
    }
    if (!res.ok) throw new UpstreamError(`Yahoo 股市回應 HTTP ${res.status}`);

    const items = parseRss(await res.text());
    return { source: "yahoo", stockId, items };
  });
}
