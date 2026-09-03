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
import type { PerformancePoint } from "@/lib/compare";

// Categorical slots 1-3 (validated: CVD ΔE ≥ 9.2, normal-vision ≥ 27.6 on white).
// Aqua sits below 3:1 contrast, so every line carries a visible end label.
const SERIES = [
  { key: "equal", name: "SA equal weight", color: "#2a78d6" },
  { key: "cap", name: "SA cap-weighted", color: "#eb6834" },
  { key: "spmo", name: "SPMO", color: "#1baf7a" },
] as const;

type Props = { series: PerformancePoint[] };

// Vertical offsets that keep the three end labels ≥16px apart even when the
// lines converge. Estimated from the data range against the plot height; the
// offsets are relative, so small deviations from recharts' niced domain are fine.
function labelOffsets(series: PerformancePoint[], plotHeight: number): Record<string, number> {
  const all = series.flatMap((p) => [p.equal, p.cap, p.spmo]);
  const min = Math.min(...all);
  const range = Math.max(...all) - min || 1;
  const last = series[series.length - 1];
  const px = (v: number) => ((Math.max(...all) - v) / range) * plotHeight;
  const items = SERIES.map((s) => ({ key: s.key as string, y: px(last[s.key]) })).sort(
    (a, b) => a.y - b.y,
  );
  const adjusted = items.map((it) => ({ ...it }));
  for (let i = 1; i < adjusted.length; i++) {
    if (adjusted[i].y - adjusted[i - 1].y < 16) adjusted[i].y = adjusted[i - 1].y + 16;
  }
  const out: Record<string, number> = {};
  for (let i = 0; i < items.length; i++) out[items[i].key] = adjusted[i].y - items[i].y;
  return out;
}

export default function ComparePerformanceChart({ series }: Props) {
  const last = series[series.length - 1];
  if (!last) return null;
  const dy = labelOffsets(series, 300 - 8 - 4 - 30 /* margins + x-axis */);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={series} margin={{ top: 8, right: 130, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#52514e" }}
          tickFormatter={(d: string) => d.slice(0, 7)}
          minTickGap={48}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#52514e" }}
          tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
          domain={["auto", "auto"]}
          width={52}
        />
        <Tooltip
          formatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
          labelFormatter={(l: string) => l}
          itemSorter={(item) => -(item.value as number)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            label={(props: { index?: number; x?: number; y?: number }) =>
              props.index === series.length - 1 ? (
                <text
                  x={(props.x ?? 0) + 8}
                  y={(props.y ?? 0) + (dy[s.key] ?? 0)}
                  fill="#374151"
                  fontSize={12}
                  fontWeight={600}
                  dominantBaseline="middle"
                >
                  {`${s.name.replace("SA ", "")} ${last[s.key] >= 0 ? "+" : ""}${last[s.key].toFixed(0)}%`}
                </text>
              ) : (
                <g />
              )
            }
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
