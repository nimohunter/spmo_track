"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeightSeries } from "@/lib/data";

const PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5",
  "#0d9488", "#be123c", "#9333ea", "#ca8a04", "#0284c7",
  "#15803d", "#b91c1c", "#7e22ce", "#a16207", "#1d4ed8",
  "#059669", "#e11d48", "#6d28d9", "#92400e", "#0369a1",
  "#166534", "#991b1b", "#581c87", "#854d0e", "#1e3a8a",
];

type Props = {
  tickers: string[];
  series: WeightSeries[];
};

export default function WeightChart({ tickers, series }: Props) {
  const [isolated, setIsolated] = useState<string | null>(null);

  const handleLegendClick = (entry: unknown) => {
    const dk = (entry as { dataKey?: unknown })?.dataKey;
    const t = typeof dk === "string" ? dk : null;
    if (!t) return;
    setIsolated((prev) => (prev === t ? null : t));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {isolated
            ? `Isolated: ${isolated} — click the legend item again or "Show all" to reset.`
            : "Tip: click a ticker in the legend to isolate its line."}
        </span>
        {isolated && (
          <button
            onClick={() => setIsolated(null)}
            style={{
              fontSize: 12,
              padding: "4px 10px",
              border: "1px solid var(--border)",
              background: "#fff",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Show all
          </button>
        )}
      </div>
      <ResponsiveContainer width="100%" height={500}>
        <LineChart data={series} margin={{ top: 16, right: 24, bottom: 16, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" />
          <YAxis
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            domain={["auto", "auto"]}
          />
          <Tooltip
            formatter={(v: number) => `${v.toFixed(2)}%`}
            labelFormatter={(l: string) => `As of ${l}`}
          />
          <Legend onClick={handleLegendClick} wrapperStyle={{ cursor: "pointer" }} />
          {tickers.map((t, i) => {
            const dimmed = isolated !== null && isolated !== t;
            return (
              <Line
                key={t}
                type="monotone"
                dataKey={t}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={isolated === t ? 3 : 2}
                dot={dimmed ? false : { r: 3 }}
                activeDot={dimmed ? false : { r: 5 }}
                connectNulls={false}
                opacity={dimmed ? 0.08 : 1}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
