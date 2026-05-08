import WeightChart from "@/components/WeightChart";
import { buildWeightSeries, loadAllSnapshots } from "@/lib/data";
import type { Snapshot } from "@/lib/types";

export const dynamic = "force-static";

const TOP_N = 20;

function formatDelta(curr: number, prev: number | undefined): React.ReactNode {
  if (prev === undefined) return <span className="delta-zero">—</span>;
  const d = curr - prev;
  if (Math.abs(d) < 0.005) return <span className="delta-zero">0.00</span>;
  const cls = d > 0 ? "delta-pos" : "delta-neg";
  const sign = d > 0 ? "+" : "";
  return <span className={cls}>{sign}{d.toFixed(2)}</span>;
}

function previousWeight(prev: Snapshot | undefined, ticker: string): number | undefined {
  if (!prev) return undefined;
  return prev.holdings.find((h) => h.ticker === ticker)?.weight;
}

export default async function Page() {
  const snapshots = await loadAllSnapshots();
  if (snapshots.length === 0) {
    return (
      <main>
        <h1>SPMO Top 20 Tracker</h1>
        <p>No snapshots yet. Run <code>npm run fetch</code> or wait for the GitHub Action.</p>
      </main>
    );
  }

  const sorted = [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : undefined;
  const { tickers, series } = buildWeightSeries(sorted, TOP_N);
  const top = latest.holdings.slice(0, TOP_N);

  return (
    <main>
      <h1>SPMO Top 20 Tracker</h1>
      <p className="subtitle">
        Invesco S&amp;P 500 Momentum ETF — top {TOP_N} holdings, weight % over time.
        Latest snapshot {latest.asOfDate} · {sorted.length} snapshot{sorted.length === 1 ? "" : "s"} on file.
      </p>

      <div className="card">
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Weight changes over time</h2>
        {sorted.length === 1 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Need at least two snapshots to draw a chart. Come back after the next scheduled run.
          </p>
        ) : (
          <WeightChart tickers={tickers} series={series} />
        )}
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>
          Latest holdings · {latest.asOfDate}
        </h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Ticker</th>
              <th>Name</th>
              <th className="num">Weight %</th>
              <th className="num">Δ vs prev</th>
            </tr>
          </thead>
          <tbody>
            {top.map((h) => (
              <tr key={h.ticker}>
                <td>{h.rank}</td>
                <td><strong>{h.ticker}</strong></td>
                <td>{h.name}</td>
                <td className="num">{h.weight.toFixed(2)}</td>
                <td className="num">{formatDelta(h.weight, previousWeight(previous, h.ticker))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer>
        Source: <a href={latest.source}>{latest.source}</a> · Snapshots collected via GitHub Actions.
      </footer>
    </main>
  );
}
