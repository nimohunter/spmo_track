import Link from "next/link";
import RankingTable from "@/components/RankingTable";
import { loadAllRankings } from "@/lib/data";

export const dynamic = "force-static";

export default async function RankingPage() {
  const rankings = await loadAllRankings();

  if (rankings.length === 0) {
    return (
      <main>
        <Nav />
        <h1>Monthly momentum ranking</h1>
        <p className="subtitle">
          Simulated S&amp;P 500 Momentum ranking — what SPMO would hold if it rebalanced today.
        </p>
        <div className="card">
          <p>No rankings on file yet.</p>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Run <code>npm run fetch:sp500</code>, then <code>npm run fetch:prices</code>, then{" "}
            <code>npm run compute:rankings</code>.
          </p>
        </div>
      </main>
    );
  }

  const sorted = [...rankings].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  const latest = sorted[sorted.length - 1];
  const adds = latest.predictedAdds.length;
  const drops = latest.predictedDrops.length;

  return (
    <main>
      <Nav />
      <h1>Monthly momentum ranking</h1>
      <p className="subtitle">
        Risk-adjusted momentum score for all S&amp;P 500 names · as of {latest.asOfDate}.{" "}
        SPMO holdings: full NPORT {latest.spmoFullDate ?? "n/a"}
        {latest.spmoPartialDate &&
          ` + partial top-25 ${latest.spmoPartialDate}`}
        .
      </p>

      <div className="card">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <Stat label="Universe" value={latest.universeSize.toString()} />
          <Stat label="Top N (selection)" value={latest.topN.toString()} />
          <Stat label="Predicted adds" value={adds.toString()} tone="pos" />
          <Stat label="Predicted drops" value={drops.toString()} tone="neg" />
        </div>
      </div>

      {adds + drops > 0 && (
        <div className="card">
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>
            If SPMO rebalanced today
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 16,
            }}
          >
            <TickerCloud
              title={`Likely adds (${adds})`}
              tickers={latest.predictedAdds}
              tone="pos"
            />
            <TickerCloud
              title={`Likely drops (${drops})`}
              tickers={latest.predictedDrops}
              tone="neg"
            />
          </div>
        </div>
      )}

      <div className="card">
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Full ranking</h2>
        <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}>
          Score = MV / σ<sub>daily</sub>, z-scored across the universe and winsorized at ±3.
          MV = (price 2 months ago) / (price 14 months ago) − 1. Top {latest.topN} = predicted SPMO constituents.
        </p>
        <RankingTable entries={latest.entries} topN={latest.topN} />
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
      <Link href="/ranking" style={{ color: "var(--accent)", fontWeight: 600 }}>
        Monthly ranking
      </Link>
    </nav>
  );
}

function TickerCloud({
  title,
  tickers,
  tone,
}: {
  title: string;
  tickers: string[];
  tone: "pos" | "neg";
}) {
  const colors =
    tone === "pos"
      ? { headFg: "#166534", chipBg: "#dcfce7", chipFg: "#166534" }
      : { headFg: "#991b1b", chipBg: "#fee2e2", chipFg: "#991b1b" };
  return (
    <div style={{ minWidth: 0 }}>
      <h3 style={{ fontSize: 14, color: colors.headFg, margin: "0 0 8px" }}>{title}</h3>
      {tickers.length === 0 ? (
        <span style={{ fontSize: 13, color: "var(--muted)" }}>—</span>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {tickers.map((t) => (
            <code
              key={t}
              style={{
                background: colors.chipBg,
                color: colors.chipFg,
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              {t}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  const color = tone === "pos" ? "#16a34a" : tone === "neg" ? "#dc2626" : "var(--fg)";
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.04 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}
