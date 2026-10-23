import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Strategy research on the real Binance history (network): run with LIVE_RESEARCH=1. Skipped
 * otherwise, so CI never depends on it. Downloads every series of the catalog, checks the
 * data, runs the research and prints each strategy's results by category. With
 * RESEARCH_DATA_DIR the journal is kept there (never point it at apps/web/data); with
 * RESEARCH_OUT the reports are also written to that file.
 */
const live = Boolean(process.env.LIVE_RESEARCH);
const originalDir = process.env.JOURNAL_DATA_DIR;
const keep = process.env.RESEARCH_DATA_DIR;
const scratch = keep ?? mkdtempSync(join(tmpdir(), "journal-live-research-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { refreshAll, loadInstruments, staleSeries } =
  await import("../src/server/strategy-research/data");
const { runResearch } = await import("../src/server/strategy-research/research");
afterAll(() => {
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  if (!keep) rmSync(scratch, { recursive: true, force: true });
});

const DAY = 86_400_000;
const pct = (x: number | null | undefined) =>
  x == null ? "  n/a " : `${(x * 100).toFixed(1).padStart(6)}%`;
const num = (x: number | null | undefined) => (x == null ? " n/a" : x.toFixed(2).padStart(5));

describe.skipIf(!live)("strategy research on Binance's history", () => {
  it("downloads complete, closed, gap-free daily data and evaluates the catalog", async () => {
    await refreshAll();
    const instruments = loadInstruments();
    expect(staleSeries(instruments)).toEqual([]);
    for (const i of instruments) {
      expect(i.bars.length).toBeGreaterThan(2000);
      const gaps = i.bars.slice(1).filter((b, k) => b.time - i.bars[k]!.time !== DAY);
      console.log(
        `${i.id}: ${i.bars.length} days, ${gaps.length} gaps, funding ${i.funding?.length ?? "-"}`,
      );
      expect(i.bars[i.bars.length - 1]!.time + DAY).toBeLessThanOrEqual(Date.now());
    }
    const reports = await runResearch(instruments);
    for (const r of reports) {
      console.log(`\n${r.strategyId}  verdict ${r.verdict}  chosen ${r.selected?.label}`);
      console.log(
        `  DSR ${num(r.deflated.dsr)} (trials ${r.deflated.trials}, threshold ${r.deflated.threshold.toFixed(4)})  PBO ${num(r.pbo?.pbo)}`,
      );
      for (const s of [r.inSample, r.walkForward, r.holdout]) {
        if (!s) continue;
        const m = s.metrics;
        console.log(
          `  ${s.category.padEnd(12)} ${new Date(s.from!).toISOString().slice(0, 10)}..${new Date(s.to!).toISOString().slice(0, 10)} CAGR ${pct(m.cagr)} Sharpe ${num(m.sharpe)} MaxDD ${pct(m.maxDrawdown)} vol ${pct(m.volatility)} | bench Sharpe ${num(s.benchmark?.sharpe)} MaxDD ${pct(s.benchmark?.maxDrawdown)} | boot ${num(s.bootstrap?.low)}..${num(s.bootstrap?.high)} turnover ${s.trading.annualTurnover.toFixed(1)} exposure ${s.trading.exposure.toFixed(2)}`,
        );
      }
      for (const c of r.criteria)
        console.log(
          `   [${c.passed === null ? "?" : c.passed ? "x" : " "}] ${c.label}: ${c.value}`,
        );
    }
    if (process.env.RESEARCH_OUT)
      writeFileSync(
        process.env.RESEARCH_OUT,
        JSON.stringify(
          reports.map(({ inSample, walkForward, holdout, ...r }) => ({
            ...r,
            categories: [inSample, walkForward, holdout].map(
              (s) => s && { ...s, equity: undefined },
            ),
          })),
          null,
          1,
        ),
      );
    expect(reports.find((r) => r.strategyId === "btc-buy-hold")?.verdict).toBe("benchmark");
  }, 600_000);
});
