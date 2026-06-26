import Link from "next/link";
import { loadSeekingAlphaComparison, type ComparedPick, type ComparedYear } from "@/lib/compare";

export const dynamic = "force-static";

export default async function ComparePage() {
  const report = await loadSeekingAlphaComparison();

  if (!report) {
    return (
      <main>
        <Nav />
        <h1>Seeking Alpha vs SPMO</h1>
        <div className="card">
          <p>No ranking on file yet — run <code>npm run compute:rankings</code>.</p>
        </div>
      </main>
    );
  }

  const [first, last] = [report.years[0], report.years[report.years.length - 1]];

  return (
    <main>
      <Nav />
      <h1>Seeking Alpha vs SPMO</h1>
      <p className="subtitle">
        Do Seeking Alpha&apos;s Quant &quot;Top 10 Stocks for the Year&quot; (Steven Cress) overlap with
        SPMO&apos;s pond? SPMO can only hold <strong>S&amp;P 500</strong> names and selects by
        risk-adjusted <strong>momentum</strong>; SA Quant screens the whole market on a multi-factor
        (GARP) model. Eligibility &amp; momentum rank as of {report.rankingDate}; SPMO holdings as of{" "}
        {report.snapshotDate}.
      </p>

      {first && last && first.year !== last.year && (
        <div className="card">
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>The overlap moved a lot year to year</h2>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center" }}>
            <Swing label="In S&P 500 (eligible)" a={first} b={last} field="eligibleCount" />
            <Swing label="Held by SPMO" a={first} b={last} field="heldCount" />
            <Swing label="In momentum top 100" a={first} b={last} field="topNCount" />
          </div>
          <p style={{ margin: "16px 0 0", color: "var(--muted)", fontSize: 13 }}>
            The swing tracks SA&apos;s cap-size tilt: {first.year}&apos;s picks leaned small/mid-cap
            (outside SPMO&apos;s universe), while {last.year}&apos;s leaned large-cap AI/semis — exactly
            SPMO&apos;s wheelhouse. When SA fishes in large-caps, the lists converge; when it fishes in
            small-caps, they barely touch.
          </p>
        </div>
      )}

      {report.years.map((y) => (
        <YearTable key={y.year} year={y} topN={report.topN} />
      ))}
    </main>
  );
}

function Swing({
  label,
  a,
  b,
  field,
}: {
  label: string;
  a: ComparedYear;
  b: ComparedYear;
  field: "eligibleCount" | "heldCount" | "topNCount";
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 0.04,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>
        <span style={{ color: "var(--muted)" }}>
          {countFor(a, field)}/{a.total}
        </span>
        <span style={{ color: "var(--muted)", margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--accent)" }}>
          {countFor(b, field)}/{b.total}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        {a.year} → {b.year}
      </div>
    </div>
  );
}

function countFor(y: ComparedYear, field: "eligibleCount" | "heldCount" | "topNCount"): number {
  return y[field];
}

function YearTable({ year, topN }: { year: ComparedYear; topN: number }) {
  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>
        Top 10 for {year.year}{" "}
        <span style={{ fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
          {year.selectedOn ? `· selected ${year.selectedOn}` : ""}
        </span>
      </h2>
      <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}>
        <strong>{year.eligibleCount}/{year.total}</strong> in the S&amp;P 500 ·{" "}
        <strong>{year.heldCount}/{year.total}</strong> held by SPMO ·{" "}
        <strong>{year.topNCount}/{year.total}</strong> in the momentum top {topN}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Company</th>
              <th>S&amp;P 500?</th>
              <th style={{ textAlign: "right" }}>SPMO weight</th>
              <th style={{ textAlign: "right" }}>Momentum rank</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {year.picks.map((p) => (
              <Row key={p.ticker} p={p} topN={topN} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ p, topN }: { p: ComparedPick; topN: number }) {
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{p.ticker}</td>
      <td style={{ color: "var(--muted)" }}>{p.name}</td>
      <td>{p.inSp500 ? "✓" : <span style={{ color: "var(--muted)" }}>—</span>}</td>
      <td style={{ textAlign: "right" }}>
        {p.spmoWeight != null ? (
          `${p.spmoWeight.toFixed(2)}%`
        ) : (
          <span style={{ color: "var(--muted)" }}>—</span>
        )}
      </td>
      <td style={{ textAlign: "right" }}>
        {p.momentumRank != null ? (
          <span style={{ color: p.inMomentumTopN ? "#16a34a" : "var(--fg)" }}>
            #{p.momentumRank}
            {p.inMomentumTopN ? ` (top ${topN})` : ""}
          </span>
        ) : (
          <span style={{ color: "var(--muted)" }}>not in universe</span>
        )}
      </td>
      <td>
        <Verdict status={p.status} />
      </td>
    </tr>
  );
}

function Verdict({ status }: { status: ComparedPick["status"] }) {
  const map = {
    held: { bg: "#dcfce7", fg: "#166534", text: "held by SPMO" },
    add: { bg: "#dbeafe", fg: "#1e40af", text: "likely add" },
    eligible: { bg: "#fef9c3", fg: "#854d0e", text: "eligible, low momentum" },
    ineligible: { bg: "#f3f4f6", fg: "#6b7280", text: "not in S&P 500" },
  } as const;
  const s = map[status];
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {s.text}
    </span>
  );
}

function Nav() {
  return (
    <nav style={{ marginBottom: 20, display: "flex", gap: 16, fontSize: 14 }}>
      <Link href="/" style={{ color: "var(--accent)" }}>
        ← SPMO holdings
      </Link>
      <Link href="/ranking" style={{ color: "var(--accent)" }}>
        Monthly ranking
      </Link>
      <Link href="/gains" style={{ color: "var(--accent)" }}>
        Rebalance gains
      </Link>
      <Link href="/compare" style={{ color: "var(--accent)", fontWeight: 600 }}>
        Seeking Alpha
      </Link>
    </nav>
  );
}
