// 簡單的記憶體快取，避免短時間內重複打外部 API（外部 API 打太兇可能被封 IP）
const store = new Map<string, { expires: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;

  const value = load();
  store.set(key, { expires: Date.now() + ttlMs, value });
  // 失敗的結果不要快取
  value.catch(() => store.delete(key));
  return value;
}
