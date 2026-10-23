import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hiddenBetaLinks, readBetaFlags } from "../src/lib/beta-features";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-beta-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const beta = await import("../src/app/api/beta/route");
const { getBetaFlags, saveBetaFlags } = await import("../src/server/beta-features");
const research = await import("../src/app/api/research/route");
const intelligence = await import("../src/app/api/video-intelligence/route");
const { ResearchWorker } = await import("../src/server/strategy-research/worker");
const store = await import("../src/server/strategy-research/store");
afterAll(() => {
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

const put = (body: unknown) =>
  beta.PUT(new Request("http://localhost/api/beta", { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.stubEnv("JOURNAL_PASSWORD", "");
  saveBetaFlags({ videoIntelligence: false, strategyResearch: false });
});

describe("beta features", () => {
  it("are off until switched on, and anything malformed reads as off", () => {
    expect(readBetaFlags(undefined)).toEqual({ videoIntelligence: false, strategyResearch: false });
    expect(readBetaFlags({ videoIntelligence: "yes", strategyResearch: true })).toEqual({
      videoIntelligence: false,
      strategyResearch: true,
    });
  });

  it("a beta feature that is off leaves the sidebar", () => {
    const hidden = hiddenBetaLinks({ videoIntelligence: false, strategyResearch: true });
    expect(hidden.has("/video-intelligence")).toBe(true);
    expect(hidden.has("/research")).toBe(false);
  });

  it("its API answers 404 while off, and works once switched on", async () => {
    expect((await research.GET()).status).toBe(404);
    expect(
      (await intelligence.GET(new Request("http://localhost/api/video-intelligence"))).status,
    ).toBe(404);
    expect((await put({ strategyResearch: true })).status).toBe(200);
    expect(getBetaFlags()).toEqual({ videoIntelligence: false, strategyResearch: true });
    expect((await research.GET()).status).toBe(200);
    expect(
      (await intelligence.GET(new Request("http://localhost/api/video-intelligence"))).status,
    ).toBe(404);
  });

  it("refuses unknown features and values that are not true or false", async () => {
    expect((await put({ charts: true })).status).toBe(400);
    expect((await put({ strategyResearch: "on" })).status).toBe(400);
    expect((await put([])).status).toBe(400);
  });

  it("its background work does nothing while off, even with monitoring started", async () => {
    store.saveResearchSettings({ ...store.DEFAULT_RESEARCH, monitoring: true });
    const refresh = vi.fn(async () => ({}));
    await new ResearchWorker({ refresh }).tick();
    expect(refresh).not.toHaveBeenCalled();
  });
});
