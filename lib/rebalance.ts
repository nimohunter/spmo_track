// Pure date helpers shared by server-side data loading and client chart labels.
// The S&P 500 Momentum Index reconstitutes at the close of the 3rd Friday of
// March and September. Snapshots are captured weeks after that (NPORT filings,
// Invesco CSVs), so a snapshot's own date is misleading as a chart label: the
// constituent set belongs to the preceding rebalance, and the weights have
// drifted since. Label by rebalance period, show the as-of date alongside.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function thirdFridayOfMonth(year: number, month: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offsetToFirstFriday = (5 - first.getUTCDay() + 7) % 7;
  const day = 1 + offsetToFirstFriday + 14;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// The most recent Mar/Sep rebalance date strictly before the given date
// (strict: the rebalance takes effect at the close, so a snapshot dated on
// the rebalance day itself still shows the old book).
export function rebalancePeriodStart(date: string): string | null {
  const year = Number(date.slice(0, 4));
  let start: string | null = null;
  for (let y = year - 1; y <= year; y++) {
    for (const month of [3, 9]) {
      const reb = thirdFridayOfMonth(y, month);
      if (reb < date) start = reb;
    }
  }
  return start;
}

// "Mar 2026" — the rebalance period a snapshot belongs to.
export function rebalanceLabel(snapshotDate: string): string {
  const start = rebalancePeriodStart(snapshotDate);
  if (!start) return snapshotDate;
  const m = Number(start.slice(5, 7));
  return `${MONTHS[m - 1]} ${start.slice(0, 4)}`;
}
