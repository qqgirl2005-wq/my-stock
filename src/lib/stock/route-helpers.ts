import { UpstreamError } from "./types";
import { isValidStockId } from "./utils";

export function badStockId(stockId: string): Response | null {
  return isValidStockId(stockId)
    ? null
    : Response.json({ error: `股票代號格式錯誤：${stockId}` }, { status: 400 });
}

export async function respond<T>(load: () => Promise<T>, status = 200): Promise<Response> {
  try {
    return Response.json(await load(), { status });
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : 500;
    const message = err instanceof Error ? err.message : "未知錯誤";
    console.error("[stock api]", message);
    return Response.json({ error: message }, { status });
  }
}
