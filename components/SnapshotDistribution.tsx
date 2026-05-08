"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Holding } from "@/lib/types";

const TOP_N = 20;

const PALETTE = [
  "#2563eb", "#1d4ed8", "#3b82f6", "#60a5fa", "#93c5fd",
  "#0891b2", "#06b6d4", "#22d3ee", "#67e8f9", "#a5f3fc",
  "#16a34a", "#22c55e", "#4ade80", "#86efac", "#bbf7d0",
  "#d97706", "#f59e0b", "#fbbf24", "#fcd34d", "#fde68a",
];

type SnapshotLite = {
  asOfDate: string;
  holdings: Holding[];
};

type Props = {
  snapshots: SnapshotLite[];
};

export default function SnapshotDistribution({ snapshots }: Props) {
  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)),
    [snapshots],
  );
  const [selected, setSelected] = useState(sorted[sorted.length - 1].asOfDate);

  const idx = sorted.findIndex((s) => s.asOfDate === selected);
  const snap = sorted[idx];
  const top = snap.holdings.slice(0, TOP_N);
  const totalWeight = top.reduce((a, h) => a + h.weight, 0);
  // Reverse for chart so largest weight renders at the top of the YAxis.
  const chartData = [...top].reverse();

  const goto = (delta: number) => {
    const next = idx + delta;
    if (next >= 0 && next < sorted.length) setSelected(sorted[next].asOfDate);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <label htmlFor="snap-date" style={{ fontSize: 13, color: "var(--muted)" }}>
          Snapshot date:
        </label>
        <button
          type="button"
          onClick={() => goto(-1)}
          disabled={idx === 0}
          aria-label="Previous snapshot"
          style={btnStyle(idx === 0)}
        >
          ←
        </button>
        <select
          id="snap-date"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{
            padding: "6px 10px",
            fontSize: 14,
            border: "1px solid var(--border)",
            borderRadius: 4,
            background: "#fff",
            cursor: "pointer",
            minWidth: 140,
          }}
        >
          {sorted.map((s) => (
            <option key={s.asOfDate} value={s.asOfDate}>
              {s.asOfDate}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => goto(1)}
          disabled={idx === sorted.length - 1}
          aria-label="Next snapshot"
          style={btnStyle(idx === sorted.length - 1)}
        >
          →
        </button>
        <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: "auto" }}>
          Top {top.length} = {totalWeight.toFixed(1)}% of fund · {snap.holdings.length} total positions
        </span>
      </div>

      <ResponsiveContainer width="100%" height={Math.max(400, top.length * 26)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 60, bottom: 8, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            domain={[0, "auto"]}
          />
          <YAxis dataKey="ticker" type="category" width={80} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(2)}%`, "Weight"]}
            labelFormatter={(l: string) => {
              const h = top.find((x) => x.ticker === l);
              return h ? `${h.ticker} — ${h.name}` : l;
            }}
          />
          <Bar dataKey="weight" radius={[0, 3, 3, 0]} label={{ position: "right", formatter: (v: number) => `${v.toFixed(2)}%`, fontSize: 11, fill: "#374151" }}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={PALETTE[chartData.length - 1 - i]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    fontSize: 14,
    border: "1px solid var(--border)",
    borderRadius: 4,
    background: disabled ? "#f3f4f6" : "#fff",
    color: disabled ? "#9ca3af" : "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
