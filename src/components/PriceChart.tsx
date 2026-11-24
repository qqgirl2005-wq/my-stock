"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtInt, fmtPrice, toneText } from "@/lib/format";
import type { Candle } from "@/lib/stock/types";
import { cssVar, useIsDark } from "./ui";

const MA = [
  { period: 5, color: "#f5a524" },
  { period: 20, color: "#8b5cf6" },
] as const;

function movingAverage(candles: Candle[], period: number) {
  const out: { time: string; value: number }[] = [];
  let sum = 0;
  candles.forEach((c, i) => {
    sum += c.close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: c.date, value: sum / period });
  });
  return out;
}

export default function PriceChart({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDark = useIsDark();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const mas = useMemo(() => MA.map((m) => ({ ...m, data: movingAverage(candles, m.period) })), [candles]);
  const indexByDate = useMemo(() => new Map(candles.map((c, i) => [c.date, i])), [candles]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const up = cssVar("--up");
    const down = cssVar("--down");
    const grid = cssVar("--chart-grid");
    const text = cssVar("--chart-text");
    const line = cssVar("--border-strong");

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: line, width: 1, style: LineStyle.Dashed, labelBackgroundColor: text },
        horzLine: { color: line, width: 1, style: LineStyle.Dashed, labelBackgroundColor: text },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      localization: { locale: "zh-TW" },
    });

    const price = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderVisible: false,
      wickUpColor: up,
      wickDownColor: down,
      priceLineColor: line,
    });
    price.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.24 } });
    price.setData(candles.map((c) => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close })));

    for (const m of mas) {
      const s = chart.addSeries(LineSeries, {
        color: m.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(m.data);
    }

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volume.setData(
      candles.map((c) => ({ time: c.date, value: c.volume, color: `${c.close >= c.open ? up : down}55` })),
    );

    chart.subscribeCrosshairMove((param) => {
      const i = typeof param.time === "string" ? indexByDate.get(param.time) : undefined;
      setHoverIndex(i ?? null);
    });

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, mas, indexByDate, isDark]);

  // 圖例：滑鼠所在那根 K 棒，沒有就顯示最新一根
  const i = hoverIndex ?? candles.length - 1;
  const c = candles[i];
  const prevClose = i > 0 ? candles[i - 1].close : null;
  const chg = c && prevClose !== null ? c.close - prevClose : null;
  const maValue = (period: number) => mas.find((m) => m.period === period)?.data.find((d) => d.time === c?.date)?.value;

  return (
    <div className="relative">
      {c && (
        <div className="pointer-events-none absolute left-0 top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums text-muted">
          <span className="text-fg">{c.date}</span>
          <span>開 <span className="text-fg">{fmtPrice(c.open)}</span></span>
          <span>高 <span className="text-fg">{fmtPrice(c.high)}</span></span>
          <span>低 <span className="text-fg">{fmtPrice(c.low)}</span></span>
          <span>收 <span className={toneText(chg)}>{fmtPrice(c.close)}</span></span>
          <span>量 <span className="text-fg">{fmtInt(c.volume)}</span></span>
          {MA.map((m) => (
            <span key={m.period} style={{ color: m.color }}>
              MA{m.period} {fmtPrice(maValue(m.period) ?? null)}
            </span>
          ))}
        </div>
      )}
      <div ref={containerRef} className="h-[380px] w-full pt-8 sm:h-[420px]" aria-label="歷史 K 線圖" />
    </div>
  );
}
