import Link from "next/link";
import {
  loadSeekingAlphaComparison,
  type ComparedPick,
  type ComparedYear,
} from "@/lib/compare";

export const dynamic = "force-static";

export default async function ComparePage() {
  const report = await loadSeekingAlphaComparison();

  if (!report) {
    return (
      <main>
        <Nav />
        <h1>Seeking Alpha vs SPMO</h1>
        <div className="card">
          <p>No comparison data on file.</p>
        </div>
      </main>
    );
  }

  const [first, last] = [report.years[0], report.years[report.years.length - 1]];
  const strong = report.strongMomentumPct;

  return (
    <main>
      <Nav />
      <h1>Seeking Alpha vs SPMO</h1>
      <p className="subtitle">
        Do Seeking Alpha&apos;s Quant &quot;Top 10 Stocks for the Year&quot; (Steven Cress) overlap with
        SPMO? SPMO can only hold <strong>S&amp;P 500</strong> names and selects purely by{" "}
        <strong>momentum</strong>. Each pick is scored by SPMO&apos;s momentum formula{" "}
        <em>as of the day SA chose it</em> — so the 2025 list is judged on 2024 data. SPMO holdings as
        of {report.snapshotDate}.
      </p>

      {first && last && first.year !== last.year && (
        <div className="card">
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>
            Same momentum instinct — different pond
          </h2>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center" }}>
            <Swing
              label={`Strong momentum at pick (≥${strong.toFixed(0)}%)`}
              a={first}
              b={last}
              field="strongMomentumCount"
            />
            <Swing label="In S&P 500 (SPMO-eligible)" a={first} b={last} field="eligibleCount" />
            <Swing label="Held by SPMO" a={first} b={last} field="heldCount" />
          </div>
          <p style={{ margin: "16px 0 0", color: "var(--muted)", fontSize: 13 }}>
            Both years SA picks are <strong>momentum-heavy</strong> ({first.strongMomentumCount}/
            {first.total} and {last.strongMomentumCount}/{last.total} cleared {strong.toFixed(0)}% trailing
            momentum) — so the lists don&apos;t differ on momentum. What swings is{" "}
            <strong>eligibility</strong>: {first.year} leaned small/mid-cap (outside SPMO&apos;s S&amp;P 500
            universe, {first.eligibleCount}/{first.total} eligible), while {last.year} leaned large-cap
            AI/semis ({last.eligibleCount}/{last.total}). SPMO can only own the momentum winners that
            happen to be in the S&amp;P 500.
          </p>
        </div>
      )}

      {report.years.map((y) => (
        <YearTable key={y.year} year={y} strong={strong} />
      ))}

      {report.momentumNote && (
        <p style={{ color: "var(--muted)", fontSize: 12 }}>{report.momentumNote}</p>
      )}
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
  field: "eligibleCount" | "heldCount" | "strongMomentumCount";
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
          {a[field]}/{a.total}
        </span>
        <span style={{ color: "var(--muted)", margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--accent)" }}>
          {b[field]}/{b.total}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        {a.year} → {b.year}
      </div>
    </div>
  );
}

function YearTable({ year, strong }: { year: ComparedYear; strong: number }) {
  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>
        Top 10 for {year.year}{" "}
        <span style={{ fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
          {year.selectedOn ? `· selected ${year.selectedOn}` : ""}
        </span>
      </h2>
      <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}>
        <strong>
          {year.strongMomentumCount}/{year.total}
        </strong>{" "}
        strong momentum at pick ·{" "}
        <strong>
          {year.eligibleCount}/{year.total}
        </strong>{" "}
        in the S&amp;P 500 ·{" "}
        <strong>
          {year.heldCount}/{year.total}
        </strong>{" "}
        held by SPMO
      </p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Company</th>
              <th style={{ textAlign: "right" }}>Momentum @ pick</th>
              <th>S&amp;P 500?</th>
              <th style={{ textAlign: "right" }}>SPMO weight</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {year.picks.map((p) => (
              <Row key={p.ticker} p={p} strong={strong} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ p, strong }: { p: ComparedPick; strong: number }) {
  const momPct = p.mom12m != null ? p.mom12m * 100 : null;
  const momStrong = momPct != null && momPct >= strong;
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{p.ticker}</td>
      <td style={{ color: "var(--muted)" }}>{p.name}</td>
      <td
        style={{
          textAlign: "right",
          color: momPct == null ? "var(--muted)" : momStrong ? "#16a34a" : "var(--fg)",
          fontWeight: momStrong ? 600 : 400,
        }}
      >
        {momPct == null ? "—" : `${momPct >= 0 ? "+" : ""}${momPct.toFixed(0)}%`}
      </td>
      <td>{p.inSp500 ? "✓" : <span style={{ color: "var(--muted)" }}>—</span>}</td>
      <td style={{ textAlign: "right" }}>
        {p.spmoWeight != null ? (
          `${p.spmoWeight.toFixed(2)}%`
        ) : (
          <span style={{ color: "var(--muted)" }}>—</span>
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
    eligible: { bg: "#fef9c3", fg: "#854d0e", text: "in S&P 500, not held" },
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
