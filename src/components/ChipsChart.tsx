"use client";

import { ColorType, createChart, HistogramSeries, LineSeries, LineStyle } from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { ChipDay } from "@/lib/stock/types";
import { cssVar, useIsDark } from "./ui";

/** 三大法人合計買賣超（柱狀，右軸）+ 外資持股比例（折線，左軸） */
export default function ChipsChart({ days }: { days: ChipDay[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDark = useIsDark();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const up = cssVar("--up");
    const down = cssVar("--down");
    const accent = cssVar("--accent");
    const line = cssVar("--border-strong");
    const text = cssVar("--chart-text");

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: cssVar("--chart-grid") } },
      crosshair: {
        vertLine: { color: line, style: LineStyle.Dashed, labelBackgroundColor: text },
        horzLine: { color: line, style: LineStyle.Dashed, labelBackgroundColor: text },
      },
      leftPriceScale: { visible: true, borderVisible: false },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      localization: { locale: "zh-TW" },
    });

    const net = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    net.setData(
      days
        .filter((d) => d.totalNet !== null)
        .map((d) => ({ time: d.date, value: d.totalNet!, color: `${d.totalNet! >= 0 ? up : down}cc` })),
    );

    const ratio = chart.addSeries(LineSeries, {
      priceScaleId: "left",
      color: accent,
      lineWidth: 2,
      priceLineVisible: false,
      priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(2)}%` },
    });
    ratio.setData(days.filter((d) => d.foreignRatio !== null).map((d) => ({ time: d.date, value: d.foreignRatio! })));

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [days, isDark]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-1.5 rounded-sm bg-up" />
          <span className="-ml-1 h-2.5 w-1.5 rounded-sm bg-down" />
          法人合計買賣超（張，右軸）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded bg-accent" />
          外資持股比例（左軸）
        </span>
      </div>
      <div ref={containerRef} className="h-[240px] w-full" aria-label="三大法人買賣超與外資持股比例圖" />
    </div>
  );
}
