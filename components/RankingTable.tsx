"use client";

import { useMemo, useState } from "react";
import type { RankEntry } from "@/lib/types";

type Filter = "all" | "inSpmo" | "adds" | "drops";

type Props = {
  entries: RankEntry[];
  topN: number;
};

export default function RankingTable({ entries, topN }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    let r = entries;
    if (filter === "inSpmo") r = r.filter((e) => e.inSpmo);
    else if (filter === "adds") r = r.filter((e) => e.rank <= topN && !e.inSpmo);
    else if (filter === "drops") r = r.filter((e) => e.inSpmo && e.rank > topN);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter(
        (e) => e.ticker.toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
      );
    }
    return r;
  }, [entries, filter, query, topN]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {(["all", "inSpmo", "adds", "drops"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter((prev) => (prev === f && f !== "all" ? "all" : f))}
            style={pillStyle(filter === f)}
          >
            {labelFor(f)}
          </button>
        ))}
        <input
          type="text"
          placeholder="Search ticker or name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            marginLeft: "auto",
            padding: "6px 10px",
            fontSize: 14,
            border: "1px solid var(--border)",
            borderRadius: 4,
            minWidth: 200,
          }}
        />
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{rows.length} rows</span>
      </div>

      <div style={{ maxHeight: 560, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
        <table>
          <thead style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
            <tr>
              <th>#</th>
              <th>Ticker</th>
              <th>Name</th>
              <th>Sector</th>
              <th className="num">Mcap</th>
              <th className="num">MV (12m)</th>
              <th className="num">Z</th>
              <th className="num">Score×</th>
              <th className="num">Current %</th>
              <th className="num">Expected %</th>
              <th className="num">Δ</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.ticker}>
                <td>{e.rank}</td>
                <td><strong>{e.ticker}</strong></td>
                <td>{e.name}</td>
                <td style={{ color: "var(--muted)", fontSize: 13 }}>{e.sector}</td>
                <td className="num">{formatMcap(e.marketCap)}</td>
                <td className="num">{(e.mv * 100).toFixed(1)}%</td>
                <td className="num" style={zStyle(e.z)}>{e.z.toFixed(2)}</td>
                <td className="num">{e.scoreMul.toFixed(2)}</td>
                <td className="num">{formatWeight(e.currentWeight)}</td>
                <td className="num">{formatWeight(e.expectedWeight)}</td>
                <td className="num">{formatDelta(e.currentWeight, e.expectedWeight)}</td>
                <td>{statusBadge(e, topN)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function labelFor(f: Filter): string {
  if (f === "all") return "All";
  if (f === "inSpmo") return "In SPMO";
  if (f === "adds") return "Predicted adds";
  return "Predicted drops";
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 12px",
    fontSize: 13,
    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
    borderRadius: 999,
    background: active ? "var(--accent)" : "#fff",
    color: active ? "#fff" : "inherit",
    cursor: "pointer",
  };
}

function formatMcap(mc: number | null): React.ReactNode {
  if (mc == null || mc <= 0) return <span style={{ color: "var(--muted)" }}>—</span>;
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(2)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
  return `$${mc.toFixed(0)}`;
}

function formatWeight(w: number | null): React.ReactNode {
  if (w == null) return <span style={{ color: "var(--muted)" }}>—</span>;
  return `${w.toFixed(2)}%`;
}

function formatDelta(current: number | null, expected: number | null): React.ReactNode {
  if (current == null || expected == null) {
    return <span style={{ color: "var(--muted)" }}>—</span>;
  }
  const d = expected - current;
  if (Math.abs(d) < 0.01) return <span style={{ color: "var(--muted)" }}>0.00</span>;
  const color = d > 0 ? "#16a34a" : "#dc2626";
  const sign = d > 0 ? "+" : "";
  return (
    <span style={{ color, fontVariantNumeric: "tabular-nums" }}>
      {sign}
      {d.toFixed(2)}
    </span>
  );
}

function zStyle(z: number): React.CSSProperties {
  if (z >= 1) return { color: "#16a34a", fontWeight: 600 };
  if (z <= -1) return { color: "#dc2626" };
  return {};
}

function statusBadge(e: RankEntry, topN: number): React.ReactNode {
  const inTop = e.rank <= topN;
  if (e.inSpmo && inTop) return <Badge tone="neutral">held</Badge>;
  if (!e.inSpmo && inTop) return <Badge tone="pos">+ add</Badge>;
  if (e.inSpmo && !inTop) return <Badge tone="neg">− drop</Badge>;
  return <Badge tone="muted">—</Badge>;
}

function Badge({ tone, children }: { tone: "pos" | "neg" | "neutral" | "muted"; children: React.ReactNode }) {
  const map = {
    pos: { bg: "#dcfce7", fg: "#166534" },
    neg: { bg: "#fee2e2", fg: "#991b1b" },
    neutral: { bg: "#e0e7ff", fg: "#3730a3" },
    muted: { bg: "#f3f4f6", fg: "#6b7280" },
  } as const;
  const s = map[tone];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        background: s.bg,
        color: s.fg,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}
