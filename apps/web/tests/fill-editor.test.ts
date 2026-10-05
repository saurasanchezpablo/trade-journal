import { describe, expect, it } from "vitest";
import {
  fillRequest,
  fillTimeFromInput,
  fillTimeInput,
  newRow,
  rowOf,
} from "../src/lib/fill-editor";

const fill = {
  id: "f1",
  side: "buy" as const,
  quantity: 2,
  price: 100.25,
  fee: 1.5,
  executedAt: "2026-03-29T00:30:15.250Z",
};

describe("the fill editor", () => {
  it("shows and reads times in the journal's timezone, to the second, across a DST change", () => {
    // Madrid moved to summer time at 02:00 on 29 March 2026: 00:30 UTC is 01:30 winter time.
    expect(fillTimeInput(fill.executedAt, "Europe/Madrid")).toBe("2026-03-29T01:30:15");
    expect(fillTimeFromInput("2026-03-29T01:30:15", "Europe/Madrid")).toBe(
      "2026-03-29T00:30:15.000Z",
    );
    expect(fillTimeFromInput("2026-03-29T10:00", "Europe/Madrid")).toBe("2026-03-29T08:00:00.000Z");
    expect(fillTimeFromInput("tomorrow", "UTC")).toBeNull();
  });

  it("sends an untouched fill back exactly as stored, its time and symbol included", () => {
    const request = fillRequest(
      [rowOf(fill, "Europe/Madrid")],
      "btc/usd",
      "btc/usd",
      "Europe/Madrid",
    );
    expect(request).toEqual({ fills: [{ ...fill, symbol: "btc/usd" }] });
  });

  it("sends what you changed: a new time, a corrected price, a new symbol upper-cased", () => {
    const row = { ...rowOf(fill, "UTC"), price: "99.75", time: "2026-03-29T00:45:00" };
    expect(fillRequest([row], " es ", "NQ", "UTC")).toEqual({
      fills: [{ ...fill, symbol: "ES", price: 99.75, executedAt: "2026-03-29T00:45:00.000Z" }],
    });
  });

  it("adds a fill on the other side at the last time, and names a row that needs fixing", () => {
    const rows = [rowOf(fill, "UTC")];
    const added = newRow(rows);
    expect(added).toMatchObject({ side: "sell", time: rows[0]!.time, fee: "0" });
    expect(fillRequest([...rows, added], "ES", "ES", "UTC")).toEqual({
      error: "Fill 2: enter a quantity above 0.",
    });
    expect(
      fillRequest([...rows, { ...added, quantity: "1", price: "x" }], "ES", "ES", "UTC"),
    ).toEqual({ error: "Fill 2: enter the price." });
    expect(fillRequest([], "ES", "ES", "UTC")).toMatchObject({
      error: expect.stringMatching(/at least one/),
    });
    expect(fillRequest(rows, " ", "ES", "UTC")).toEqual({ error: "Enter the symbol." });
  });
});
