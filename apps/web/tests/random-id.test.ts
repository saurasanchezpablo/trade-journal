import { afterEach, describe, expect, it, vi } from "vitest";
import { randomId } from "../src/lib/random-id";

afterEach(() => vi.unstubAllGlobals());

describe("ids made in the browser", () => {
  it("work on a journal opened over plain http on the local network", () => {
    vi.stubGlobal("isSecureContext", false);
    const ids = new Set(Array.from({ length: 50 }, randomId));
    expect(ids.size).toBe(50);
    for (const id of ids)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
