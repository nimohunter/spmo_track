import Link from "next/link";
import GainsTable from "@/components/GainsTable";
import { computeRebalanceGains } from "@/lib/gains";
import { formatUsd, formatPerShare } from "@/lib/format";

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
        What SPMO would realize if it reconstituted today <em>by selling on the open market</em> —
        dumping its predicted drops in full and trimming positions to their target momentum weight.
        Shares from the {report.snapshotDate} holdings, valued at the {report.priceDate} close against
        cost basis at the {report.costBasisDate} rebalance. This is a hypothetical: a real ETF avoids
        most of these gains (see below).
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

      {report.perShareNet != null && (
        <div className="card">
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Per SPMO share</h2>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Stat
              label="Hypothetical gain / share (if sold outright)"
              value={formatPerShare(report.perShareNet)}
              tone={report.perShareNet >= 0 ? "pos" : "neg"}
              sub={`${report.navRealizedPct.toFixed(2)}% of NAV`}
            />
            {report.perShareGains != null && (
              <Stat label="Gains / share" value={formatPerShare(report.perShareGains)} tone="pos" />
            )}
            {report.perShareLosses != null && (
              <Stat
                label="Losses / share"
                value={formatPerShare(report.perShareLosses)}
                tone="neg"
              />
            )}
            <Stat
              label="SPMO price (NAV proxy)"
              value={report.spmoPrice != null ? `$${report.spmoPrice.toFixed(2)}` : "—"}
              sub={`close ${report.priceDate}`}
            />
          </div>
          <p style={{ margin: "16px 0 0", color: "var(--muted)", fontSize: 13 }}>
            If SPMO were a mutual fund that sold on the market, each share would carry about{" "}
            {formatPerShare(report.perShareNet)} of capital gain ({report.navRealizedPct.toFixed(2)}%
            of NAV), short-term because the positions were set on {report.costBasisDate}. SPMO is
            an ETF: it removes stocks through in-kind redemptions instead of selling, and it has no
            history of capital gains distributions. Read this number as the tax the ETF structure
            saves you at this rebalance, not as a payout to expect. Per-share figures are an
            estimate (net realized gain ÷ estimated shares outstanding = fund value ÷ SPMO price).
          </p>
        </div>
      )}

      <div className="card">
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>How SPMO actually handles these gains</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 24,
          }}
        >
          <div>
            <div style={compareHead("#b91c1c")}>What this page assumes</div>
            <ol style={listStyle}>
              <li>On rebalance day the fund sells every dropped stock for cash.</li>
              <li>Sale price − cost basis = a realized gain, taxable to the fund.</li>
              <li>By law the fund must pay that gain out to holders by year end.</li>
              <li>You receive a short-term capital gains distribution and owe tax on it.</li>
            </ol>
          </div>
          <div>
            <div style={compareHead("#15803d")}>What the ETF really does</div>
            <ol style={listStyle}>
              <li>
                Days before the rebalance, an authorized participant (a large broker) hands the
                fund a basket of stocks and receives new SPMO shares. This is a normal creation.
              </li>
              <li>
                On rebalance day the fund updates its redemption basket so it consists of the
                stocks leaving the index.
              </li>
              <li>
                The participant then redeems its SPMO shares. The fund pays it{" "}
                <em>in kind</em> — with the dropped stocks — and picks the lowest-cost lots.
              </li>
              <li>
                No stock was sold for cash, so no gain was realized. The dropped names are gone
                and there is nothing to distribute. Traders call this a &quot;heartbeat trade&quot;.
              </li>
            </ol>
          </div>
        </div>
        <p style={{ margin: "16px 0 8px", fontWeight: 600, fontSize: 14 }}>What you get instead</p>
        <ul style={listStyle}>
          <li>
            <strong>No capital gains distribution.</strong> The gain does not vanish — it stays inside
            the fund&apos;s NAV. You pay tax on it only when you sell your own SPMO shares, at the
            long-term rate if you have held them over a year.
          </li>
          <li>
            <strong>The regular cash dividend continues.</strong> Stock dividends collected from the
            holdings are paid out quarterly. That is income, not a capital gain, and it is small
            (SPMO yields well under 1%).
          </li>
        </ul>
        <p style={{ margin: "20px 0 8px", fontWeight: 600, fontSize: 14 }}>In practice</p>
        <ol style={listStyle}>
          <li>
            <strong>Most of the gain is avoided, not all of it.</strong> The swap needs a willing
            broker and liquid stocks — SPMO&apos;s S&amp;P 500 names qualify. But some pieces are still
            sold for cash: the leftover of a trim (say MU from 10.6% to 9%), a dropped company being
            bought out for cash, and odd-lot rounding.
          </li>
          <li>
            <strong>Losses cancel the leftovers.</strong> This book carries {formatUsd(totalLosses)} of
            realized losses against {formatUsd(totalGains)} of gains. A fund nets the two and can carry
            unused losses forward for years, so the sold pieces rarely produce a distribution.
          </li>
          <li>
            <strong>Real result: $0 or a few cents per share.</strong> SPMO replaces a large part of its
            book every year and still shows no capital gains distribution history.
          </li>
          <li>
            <strong>You still pay a real cost — in the share price, not as tax.</strong> The changes
            are public before the fund trades, so other traders buy the adds and sell the drops first
            (the &quot;index effect&quot;). Add bid-ask spreads, the market impact of{" "}
            {formatUsd(report.totalProceeds)} of turnover in one closing auction, and the swap
            broker&apos;s spread. Together these typically cost a fraction of one percent of NAV per
            rebalance — far below the {report.navRealizedPct.toFixed(2)}% hypothetical above.
          </li>
          <li>
            <strong>Tail risk: the law changes.</strong> The swap relies on one section of US tax law
            (Section 852(b)(6)). Lawmakers have proposed closing it more than once. If that ever
            happens, the hypothetical number on this page becomes a real distribution.
          </li>
        </ol>
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

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  fontSize: 14,
  lineHeight: 1.55,
  display: "grid",
  gap: 6,
};

function compareHead(color: string): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.04,
    color,
    marginBottom: 8,
  };
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
      <Link href="/compare" style={{ color: "var(--accent)" }}>
        Seeking Alpha →
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
