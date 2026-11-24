"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useAiSettings } from "@/lib/ai-settings";
import { useAiAnalysis } from "@/lib/use-ai-analysis";
import AiAnalysisPanel from "./AiAnalysisPanel";
import ChipsPanel from "./ChipsPanel";
import SettingsDialog from "./SettingsDialog";
import NewsPanel from "./NewsPanel";
import StockDashboard from "./StockDashboard";
import { LiveDot, Skeleton } from "./ui";
import Watchlist, { type MarketStatus } from "./Watchlist";

export const SITE_NAME = "我的股票摘要站";

/** 與 /api/watchlist 回傳格式相同（不能直接 import 伺服器端的檔案，它會帶進 mongoose） */
interface WatchlistEntry {
  stockId: string;
  name: string;
  addedAt: string;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

function Logo() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fg text-bg">
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
        <path d="M3 14l4-4 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 6h4v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function AddStockForm({ onAdd, disabled }: { onAdd: (id: string) => Promise<void>; disabled: boolean }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const id = input.trim().toUpperCase();
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(id);
      setInput("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="relative">
      <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-card focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10">
        <svg viewBox="0 0 16 16" className="ml-2 h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          placeholder="輸入代號加入追蹤，如 2330"
          aria-label="股票代號"
          aria-invalid={!!error}
          maxLength={6}
          className="w-full min-w-0 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-subtle sm:w-52"
        />
        <button
          type="submit"
          disabled={busy || disabled || !input.trim()}
          className="shrink-0 rounded-lg bg-fg px-3 py-1.5 text-xs font-medium text-bg transition disabled:opacity-30"
        >
          {busy ? "加入中…" : "加入"}
        </button>
      </div>
      {error && (
        <p role="alert" className="absolute right-0 top-full z-20 mt-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-up shadow-card">
          {error}
        </p>
      )}
    </form>
  );
}

export default function Dashboard() {
  const [list, setList] = useState<WatchlistEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [status, setStatus] = useState<MarketStatus>({ realtime: false, updatedAt: null, error: null });

  useEffect(() => {
    api<WatchlistEntry[]>("/api/watchlist")
      .then(setList)
      .catch((err) => setLoadError((err as Error).message));
  }, []);

  // 選取的股票被移除（或還沒選）時，預設顯示清單第一檔
  const current = list?.find((s) => s.stockId === selected) ?? list?.[0] ?? null;

  async function handleAdd(stockId: string) {
    const entry = await api<WatchlistEntry>("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stockId }),
    });
    setList((prev) => [...(prev ?? []), entry]);
    setSelected(entry.stockId);
  }

  async function handleRemove(stockId: string) {
    const entry = list?.find((s) => s.stockId === stockId);
    if (!window.confirm(`確定要把 ${entry?.name ?? ""} ${stockId} 從追蹤清單移除？`)) return;
    setRemoving(stockId);
    try {
      await api(`/api/watchlist/${stockId}`, { method: "DELETE" });
      setList((prev) => prev?.filter((s) => s.stockId !== stockId) ?? null);
    } catch (err) {
      window.alert(`移除失敗：${(err as Error).message}`);
    } finally {
      setRemoving(null);
    }
  }

  const onStatus = useCallback((s: MarketStatus) => setStatus(s), []);
  const aiSettings = useAiSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { states: aiStates, analyze } = useAiAnalysis(aiSettings);

  /** 卡片上的「AI 分析」：選取該股票、捲到 AI 面板；已有結果就直接看，沒有才打後端分析 */
  function handleCardAnalyze(stockId: string) {
    if (!aiSettings) {
      setSettingsOpen(true);
      return;
    }
    setSelected(stockId);
    const state = aiStates[stockId];
    if (state?.status !== "done" && state?.status !== "loading") analyze(stockId);
    requestAnimationFrame(() =>
      document.getElementById("ai-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  }

  return (
    <>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} current={aiSettings} />
      {/* 頂部列 */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <h1 className="text-[15px] font-semibold leading-tight tracking-tight">{SITE_NAME}</h1>
              <p className="flex items-center gap-1.5 text-[11px] text-muted">
                <LiveDot live={status.realtime} />
                {status.error
                  ? <span className="text-up">報價更新失敗</span>
                  : status.realtime ? "盤中即時・每 15 秒更新" : list?.length ? "非交易時段・顯示最近收盤" : "台股追蹤"}
                {status.updatedAt && (
                  <span className="hidden font-mono text-subtle sm:inline">
                    ・{status.updatedAt.toLocaleTimeString("zh-TW", { hour12: false })}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AddStockForm onAdd={handleAdd} disabled={list === null} />
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="設定"
              title={aiSettings ? "設定" : "設定（尚未設定 OpenAI API key）"}
              className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-card transition hover:text-fg"
            >
              <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden>
                <path
                  d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M16.2 12.3l1.3 1-1.5 2.6-1.6-.6a6 6 0 01-1.7 1l-.3 1.7h-3l-.3-1.7a6 6 0 01-1.7-1l-1.6.6L4.3 13.3l1.3-1a6 6 0 010-2l-1.3-1 1.5-2.6 1.6.6a6 6 0 011.7-1l.3-1.7h3l.3 1.7a6 6 0 011.7 1l1.6-.6 1.5 2.6-1.3 1a6 6 0 010 2z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
              {!aiSettings && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6">
        {/* 追蹤清單 */}
        <section aria-label="追蹤清單">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-subtle">追蹤清單</h2>
            {list && list.length > 0 && <span className="font-mono text-[11px] text-subtle">{list.length} / 20</span>}
          </div>
          {loadError ? (
            <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-up">追蹤清單載入失敗：{loadError}</p>
          ) : list === null ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-[200px] rounded-2xl" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
              <p className="text-sm font-medium">追蹤清單還是空的</p>
              <p className="text-xs text-muted">在右上角輸入股票代號（例如 2330），就會出現在這裡</p>
            </div>
          ) : (
            <Watchlist
              stocks={list.map((s) => ({ id: s.stockId, name: s.name }))}
              selected={current?.stockId ?? ""}
              onSelect={setSelected}
              onRemove={handleRemove}
              removing={removing}
              onStatus={onStatus}
              aiStates={aiStates}
              onAnalyze={handleCardAnalyze}
            />
          )}
        </section>

        {current && (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8">
                <StockDashboard stockId={current.stockId} stockName={current.name} />
              </div>
              <div className="flex flex-col gap-6 lg:col-span-4">
                <AiAnalysisPanel
                  stockName={current.name}
                  settings={aiSettings}
                  state={aiStates[current.stockId]}
                  onAnalyze={() => analyze(current.stockId)}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
                <div className="min-h-[420px] flex-1">
                  <NewsPanel stockId={current.stockId} stockName={current.name} />
                </div>
              </div>
            </div>
            <ChipsPanel stockId={current.stockId} />
          </>
        )}

        <footer className="pb-4 pt-2 text-center text-[11px] text-subtle">
          資料來源：臺灣證券交易所、FinMind、Yahoo 股市・僅供參考，不構成投資建議
        </footer>
      </main>
    </>
  );
}
