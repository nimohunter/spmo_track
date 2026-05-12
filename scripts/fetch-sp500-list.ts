import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SP500Entry, SP500List } from "../lib/types.ts";

const URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies";
const UA = "spmo-track research/0.1 shoda9784@gmail.com";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const OUT_PATH = join(ROOT, "data", "sp500.json");

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decode(s.replace(/<[^>]+>/g, "")).trim();
}

function extractTable(html: string): string {
  const start = html.indexOf('id="constituents"');
  if (start < 0) throw new Error("constituents table not found");
  const tableStart = html.lastIndexOf("<table", start);
  const tableEnd = html.indexOf("</table>", start);
  if (tableStart < 0 || tableEnd < 0) throw new Error("malformed table boundaries");
  return html.slice(tableStart, tableEnd);
}

function parseRows(tableHtml: string): SP500Entry[] {
  const out: SP500Entry[] = [];
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(tableHtml))) {
    const cells = Array.from(m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map((x) =>
      stripTags(x[1]),
    );
    if (cells.length < 3) continue;
    const ticker = cells[0];
    const name = cells[1];
    const sector = cells[2];
    if (!ticker || !/^[A-Z][A-Z.\-]*$/.test(ticker)) continue;
    out.push({ ticker, name, sector });
  }
  return out;
}

async function main(): Promise<void> {
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const html = await res.text();
  const tableHtml = extractTable(html);
  const constituents = parseRows(tableHtml);
  if (constituents.length < 400 || constituents.length > 520) {
    throw new Error(`Suspect constituent count: ${constituents.length}`);
  }
  constituents.sort((a, b) => a.ticker.localeCompare(b.ticker));
  const list: SP500List = {
    asOfDate: new Date().toISOString().slice(0, 10),
    source: URL,
    fetchedAt: new Date().toISOString(),
    constituents,
  };
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(list, null, 2) + "\n", "utf8");
  console.log(`Wrote ${OUT_PATH} (${constituents.length} constituents)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
