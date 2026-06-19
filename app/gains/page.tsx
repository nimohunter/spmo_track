import Link from "next/link";
import GainsTable from "@/components/GainsTable";
import { computeRebalanceGains } from "@/lib/gains";
import { formatUsd } from "@/lib/format";

export const dynamic = "force-static";

export default async function GainsPage() {
  const report = await computeRebalanceGains();

  if (!report) {
    return (
      <main>
        <Nav />
        <h1>Rebalance capital gains</h1>
        <div className="card">
          <p>Not enough data yet.</p>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Run <code>npm run fetch:prices</code> and <code>npm run compute:rankings</code>, and
            make sure a full SPMO holdings snapshot is on file.
          </p>
        </div>
      </main>
    );
  }

  const { totalRealizedGain, totalGains, totalLosses } = report;

  return (
    <main>
      <Nav />
      <h1>Rebalance capital gains</h1>
      <p className="subtitle">
        What SPMO would realize if it reconstituted today — selling its predicted drops in full
        and trimming positions to their target momentum weight. Shares from the {report.snapshotDate}{" "}
        holdings, valued at the {report.priceDate} close against cost basis at the{" "}
        {report.costBasisDate} rebalance.
      </p>

      <div className="card">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <Stat
            label="Net realized gain/loss"
            value={formatUsd(totalRealizedGain)}
            tone={totalRealizedGain >= 0 ? "pos" : "neg"}
          />
          <Stat label="Realized gains" value={formatUsd(totalGains)} tone="pos" />
          <Stat label="Realized losses" value={formatUsd(totalLosses)} tone="neg" />
          <Stat label="Turnover (proceeds)" value={formatUsd(report.totalProceeds)} />
          <Stat
            label="Positions sold"
            value={`${report.sellCount}`}
            sub={`${report.dropCount} drop · ${report.trimCount} trim`}
          />
        </div>
        <p style={{ margin: "16px 0 0", color: "var(--muted)", fontSize: 13 }}>
          Held book valued at {formatUsd(report.portfolioValue)}. Cost basis = each name&apos;s close on{" "}
          {report.costBasisDate} (the prior 3rd-Friday reconstitution); positions set then have a
          holding period under one year, so realized amounts would be short-term. Realized
          gain/loss = fraction of the position sold × (market value − cost value).
        </p>
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Positions sold at rebalance</h2>
        {report.rows.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            No drops or trims — the current book already matches the target weights.
          </p>
        ) : (
          <GainsTable rows={report.rows} />
        )}
        {report.skipped.length > 0 && (
          <p style={{ margin: "12px 0 0", color: "var(--muted)", fontSize: 12 }}>
            Excluded for missing price data: {report.skipped.join(", ")}.
          </p>
        )}
      </div>
    </main>
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
      <Link href="/gains" style={{ color: "var(--accent)", fontWeight: 600 }}>
        Rebalance gains
      </Link>
    </nav>
  );
}

function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
  sub?: string;
}) {
  const color = tone === "pos" ? "#16a34a" : tone === "neg" ? "#dc2626" : "var(--fg)";
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
      <div style={{ fontSize: 24, fontWeight: 600, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}
