"use client";

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
];

type Props = {
  tickers: string[];
  series: WeightSeries[];
};

export default function WeightChart({ tickers, series }: Props) {
  return (
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
        <Legend />
        {tickers.map((t, i) => (
          <Line
            key={t}
            type="monotone"
            dataKey={t}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
