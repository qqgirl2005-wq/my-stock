import "server-only";
import { UpstreamError } from "@/lib/stock/types";

const BASE = "https://api.openai.com/v1";

/** 只做基本格式檢查；真正有效與否交給 OpenAI 判斷 */
export function isPlausibleKey(key: string | null): key is string {
  return !!key && /^sk-[A-Za-z0-9_\-]{20,}$/.test(key);
}

/** 把 OpenAI 的錯誤轉成使用者看得懂的訊息。不回傳原始錯誤，避免帶出遮罩過的 key 片段 */
function mapError(status: number, code?: string): UpstreamError {
  if (status === 401) return new UpstreamError("OpenAI API key 無效，請到「設定」重新輸入", 401);
  if (status === 403) return new UpstreamError("這把 API key 沒有權限使用此模型", 403);
  if (status === 404) return new UpstreamError("找不到這個模型，請到「設定」換一個", 400);
  if (status === 429) {
    return code === "insufficient_quota"
      ? new UpstreamError("OpenAI 帳戶額度不足，請到 OpenAI 後台儲值", 402)
      : new UpstreamError("OpenAI 請求太頻繁，請稍後再試", 429);
  }
  return new UpstreamError(`OpenAI 服務錯誤（HTTP ${status}）`, 502);
}

async function call<T>(path: string, apiKey: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timeout = (err as Error).name === "TimeoutError";
    throw new UpstreamError(timeout ? "OpenAI 回應逾時，請再試一次" : "無法連線到 OpenAI", 504);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw mapError(res.status, body?.error?.code);
  return body as T;
}

/** 列出這把 key 可用、能拿來對話的模型 */
export async function listChatModels(apiKey: string): Promise<string[]> {
  const body = await call<{ data: { id: string }[] }>("/models", apiKey, {}, 15_000);
  return body.data
    .map((m) => m.id)
    .filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id))
    .filter((id) => !/(audio|realtime|transcribe|tts|image|search|embedding|instruct)/.test(id))
    .sort();
}

interface ResponsesOutput {
  output_text?: string;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
}

/** 呼叫 Responses API 並要求依 JSON schema 輸出（strict） */
export async function structuredResponse<T>(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const body = await call<ResponsesOutput>("/responses", opts.apiKey, {
    method: "POST",
    body: JSON.stringify({
      model: opts.model,
      input: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      text: { format: { type: "json_schema", name: opts.schemaName, strict: true, schema: opts.schema } },
      store: false,
    }),
  });

  const parts = body.output?.flatMap((o) => o.content ?? []) ?? [];
  const refusal = parts.find((p) => p.type === "refusal")?.refusal;
  if (refusal) throw new UpstreamError(`模型拒絕回答：${refusal}`, 422);

  const text = body.output_text ?? parts.filter((p) => p.type === "output_text").map((p) => p.text ?? "").join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError("模型回傳格式不正確，請再試一次", 502);
  }
}
