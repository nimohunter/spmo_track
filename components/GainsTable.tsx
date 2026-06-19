"use client";

import { useMemo, useState } from "react";
import type { GainRow } from "@/lib/gains";
import { formatUsd, formatPct } from "@/lib/format";

type Filter = "all" | "drop" | "trim";

type SortKey =
  | "ticker"
  | "name"
  | "action"
  | "currentWeight"
  | "targetWeight"
  | "soldFraction"
  | "costValue"
  | "marketValue"
  | "proceeds"
  | "realizedGain";

type SortDir = "asc" | "desc";

function sortValue(r: GainRow, key: SortKey): number | string {
  switch (key) {
    case "ticker":
      return r.ticker;
    case "name":
      return r.name;
    case "action":
      return r.action;
    default:
      return r[key];
  }
}

// String columns ascend first; numeric columns descend first.
function defaultDir(key: SortKey): SortDir {
  return key === "ticker" || key === "name" || key === "action" ? "asc" : "desc";
}

type Props = {
  rows: GainRow[];
};

export default function GainsTable({ rows }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("realizedGain");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(defaultDir(key));
    }
  }

  const view = useMemo(() => {
    let r = rows;
    if (filter !== "all") r = r.filter((x) => x.action === filter);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...r].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
  }, [rows, filter, sortKey, sortDir]);

  function SortableTh({
    label,
    sortKey: key,
    num,
  }: {
    label: string;
    sortKey: SortKey;
    num?: boolean;
  }) {
    const active = sortKey === key;
    return (
      <th
        onClick={() => toggleSort(key)}
        style={{
          cursor: "pointer",
          userSelect: "none",
          whiteSpace: "nowrap",
          textAlign: num ? "right" : "left",
        }}
        title="Click to sort"
      >
        {label}
        <span style={{ marginLeft: 4, color: active ? "var(--accent)" : "var(--border)" }}>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </th>
    );
  }

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
        {(["all", "drop", "trim"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter((prev) => (prev === f && f !== "all" ? "all" : f))}
            style={pillStyle(filter === f)}
          >
            {f === "all" ? "All" : f === "drop" ? "Drops" : "Trims"}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>
          {view.length} positions
        </span>
      </div>

      <div
        style={{
          maxHeight: 560,
          overflow: "auto",
          border: "1px solid var(--border)",
          borderRadius: 6,
        }}
      >
        <table>
          <thead style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
            <tr>
              <SortableTh label="Ticker" sortKey="ticker" />
              <SortableTh label="Name" sortKey="name" />
              <SortableTh label="Action" sortKey="action" />
              <SortableTh label="Current %" sortKey="currentWeight" num />
              <SortableTh label="Target %" sortKey="targetWeight" num />
              <SortableTh label="Sold" sortKey="soldFraction" num />
              <SortableTh label="Cost value" sortKey="costValue" num />
              <SortableTh label="Market value" sortKey="marketValue" num />
              <SortableTh label="Proceeds" sortKey="proceeds" num />
              <SortableTh label="Realized G/L" sortKey="realizedGain" num />
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const gainClass = r.realizedGain >= 0 ? "delta-pos" : "delta-neg";
              const badge =
                r.action === "drop"
                  ? { bg: "#fee2e2", fg: "#991b1b", text: r.ranked ? "drop" : "drop*" }
                  : { bg: "#fef9c3", fg: "#854d0e", text: "trim" };
              return (
                <tr key={r.ticker}>
                  <td style={{ fontWeight: 600 }}>{r.ticker}</td>
                  <td style={{ color: "var(--muted)" }}>{r.name}</td>
                  <td>
                    <span
                      style={{
                        background: badge.bg,
                        color: badge.fg,
                        padding: "1px 7px",
                        borderRadius: 4,
                        fontSize: 12,
                      }}
                    >
                      {badge.text}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>{formatPct(r.currentWeight)}</td>
                  <td style={{ textAlign: "right" }}>
                    {r.targetWeight > 0 ? formatPct(r.targetWeight) : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>{(r.soldFraction * 100).toFixed(0)}%</td>
                  <td style={{ textAlign: "right" }}>{formatUsd(r.costValue)}</td>
                  <td style={{ textAlign: "right" }}>{formatUsd(r.marketValue)}</td>
                  <td style={{ textAlign: "right" }}>{formatUsd(r.proceeds)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }} className={gainClass}>
                    {r.realizedGain >= 0 ? "+" : ""}
                    {formatUsd(r.realizedGain)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
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
