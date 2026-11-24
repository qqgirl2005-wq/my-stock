"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * BYOK：使用者自己的 OpenAI key 只存在這個瀏覽器的 localStorage，
 * 分析時才放在 header 送到我們的 API，伺服器不會儲存。
 */
export interface AiSettings {
  apiKey: string;
  model: string;
}

const STORAGE_KEY = "my-stock:openai";
const EVENT = "my-stock:openai-change";

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // 無痕模式或封鎖儲存
  }
}

function subscribe(cb: () => void) {
  // storage 事件處理其他分頁的變更，自訂事件處理同一分頁
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function saveAiSettings(settings: AiSettings | null) {
  try {
    if (settings) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 寫不進去就算了，只是下次要重新輸入
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useAiSettings(): AiSettings | null {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  return useMemo(() => {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as Partial<AiSettings>;
      return v.apiKey && v.model ? { apiKey: v.apiKey, model: v.model } : null;
    } catch {
      return null;
    }
  }, [raw]);
}

export function maskKey(key: string) {
  return key.length > 12 ? `${key.slice(0, 7)}…${key.slice(-4)}` : "••••";
}

/** 依序挑第一個可用的模型當預設（較省錢且支援結構化輸出的優先） */
const PREFERRED = ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini", "gpt-5", "gpt-4.1", "gpt-4o"];
export function pickDefaultModel(models: string[]): string {
  return PREFERRED.find((m) => models.includes(m)) ?? models.find((m) => m.startsWith("gpt-")) ?? models[0] ?? "";
}
