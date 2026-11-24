"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { type AiSettings, maskKey, pickDefaultModel, saveAiSettings } from "@/lib/ai-settings";

export default function SettingsDialog({
  open,
  onClose,
  current,
}: {
  open: boolean;
  onClose: () => void;
  current: AiSettings | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [model, setModel] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 用原生 <dialog>：內建焦點鎖定、Esc 關閉、背景遮罩
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function reset() {
    setApiKey("");
    setShowKey(false);
    setModels(null);
    setModel("");
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function loadModels(key: string) {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/models", { headers: { "X-OpenAI-Key": key }, cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const list = body as string[];
      if (list.length === 0) throw new Error("這把 key 沒有可用的對話模型");
      setModels(list);
      setModel((m) => (m && list.includes(m) ? m : list.includes(current?.model ?? "") ? current!.model : pickDefaultModel(list)));
    } catch (err) {
      setModels(null);
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const key = apiKey.trim() || current?.apiKey;
    if (!key) return;
    if (!models) {
      loadModels(key);
      return;
    }
    saveAiSettings({ apiKey: key, model });
    close();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={close}
      onClick={(e) => e.target === dialogRef.current && close()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit} className="flex flex-col gap-5 p-6">
        <div>
          <h2 className="text-base font-semibold">設定</h2>
          <p className="mt-1 text-xs text-muted">AI 分析使用你自己的 OpenAI API key（BYOK），費用由你的 OpenAI 帳戶支付。</p>
        </div>

        {current && (
          <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5 text-xs">
            <div>
              <div className="text-muted">目前使用</div>
              <div className="mt-0.5 font-mono">
                {maskKey(current.apiKey)}・{current.model}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                saveAiSettings(null);
                reset();
              }}
              className="rounded-lg px-2 py-1 text-up hover:bg-up-soft"
            >
              清除
            </button>
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">{current ? "更換 API key（留空則沿用目前的）" : "OpenAI API key"}</span>
          <div className="flex items-center rounded-xl border border-line focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setModels(null);
                setError(null);
              }}
              placeholder="sk-..."
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-sm outline-none placeholder:text-subtle"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="px-3 text-xs text-muted hover:text-fg"
            >
              {showKey ? "隱藏" : "顯示"}
            </button>
          </div>
          <span className="text-[11px] text-subtle">
            到{" "}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              platform.openai.com/api-keys
            </a>{" "}
            建立。key 只存在這個瀏覽器的 localStorage，分析時才送到本站伺服器轉呼叫 OpenAI，伺服器不會保存。
          </span>
        </label>

        {models && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">模型</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-xl border border-line bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-subtle">建議用 mini 系列，便宜且速度快。</span>
          </label>
        )}

        {error && <p role="alert" className="rounded-lg bg-up-soft px-3 py-2 text-xs text-up">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-2">
            取消
          </button>
          <button
            type="submit"
            disabled={checking || (!apiKey.trim() && !current)}
            className="rounded-lg bg-fg px-4 py-2 text-sm font-medium text-bg disabled:opacity-30"
          >
            {checking ? "驗證中…" : models ? "儲存" : "驗證 key 並載入模型"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
