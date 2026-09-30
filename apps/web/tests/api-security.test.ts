import { afterEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ token: undefined as string | undefined, set: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (jar.token ? { value: jar.token } : undefined),
    set: jar.set,
  }),
}));
const { handler, ok } = await import("../src/server/api");
const { SESSION_MAX_AGE, sessionToken, verifySession } = await import("../src/server/auth");
const { POST: signIn } = await import("../src/app/api/auth/route");

afterEach(() => {
  vi.unstubAllEnvs();
  jar.token = undefined;
  jar.set.mockReset();
});

const post = (headers: Record<string, string>, body = "{}") =>
  new Request("http://journal.local/api/demo", { method: "POST", headers, body });

describe("changes from other sites", () => {
  const action = vi.fn(async () => ok({ changed: true }));
  const route = handler(action);

  it("a page on another site cannot change the journal", async () => {
    action.mockClear();
    expect((await route(post({ "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await route(post({ "sec-fetch-site": "same-site" }))).status).toBe(403);
    expect(
      (await route(post({ origin: "https://evil.example", host: "journal.local" }))).status,
    ).toBe(403);
    expect(action).not.toHaveBeenCalled();
  });

  it("the journal's own pages, scripts and a reverse proxy still can", async () => {
    expect((await route(post({ "sec-fetch-site": "same-origin" }))).status).toBe(200);
    expect((await route(post({}))).status).toBe(200);
    expect(
      (
        await route(
          post({
            origin: "https://journal.example.com",
            host: "127.0.0.1:3000",
            "x-forwarded-host": "journal.example.com",
          }),
        )
      ).status,
    ).toBe(200);
    vi.stubEnv("JOURNAL_PUBLIC_URL", "https://journal.example.com");
    expect(
      (await route(post({ origin: "https://journal.example.com", host: "127.0.0.1:3000" }))).status,
    ).toBe(200);
  });

  it("reading is never blocked", async () => {
    const read = new Request("http://journal.local/api/stats", {
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect((await route(read)).status).toBe(200);
  });

  it("a malformed body is a bad request, not a server error", async () => {
    const parse = handler(async (request: Request) => ok(await request.json()));
    const response = await parse(post({}, "{not json"));
    expect(response.status).toBe(400);
  });
});

describe("password sessions", () => {
  it("a session expires on the server after 30 days, whatever the browser keeps", () => {
    vi.stubEnv("JOURNAL_PASSWORD", "correct-horse");
    const issued = Date.UTC(2026, 0, 1);
    const token = sessionToken(issued);
    expect(verifySession(token, issued + 1000)).toBe(true);
    expect(verifySession(token, issued + (SESSION_MAX_AGE + 60) * 1000)).toBe(false);
  });

  it("a session with an edited date or signature is refused", () => {
    vi.stubEnv("JOURNAL_PASSWORD", "correct-horse");
    const [v, issued, nonce, signature] = sessionToken().split(".");
    expect(verifySession([v, Number(issued) + 1, nonce, signature].join("."))).toBe(false);
    expect(verifySession([v, issued, nonce, `${signature}x`].join("."))).toBe(false);
  });

  it("the old fixed session cookie no longer signs you in", () => {
    vi.stubEnv("JOURNAL_PASSWORD", "correct-horse");
    expect(verifySession("a".repeat(64))).toBe(false);
  });

  it("repeated wrong passwords pause sign-in for that client", async () => {
    vi.stubEnv("JOURNAL_PASSWORD", "correct-horse");
    const attempt = (password: string) =>
      signIn(
        new Request("http://journal.local/api/auth", {
          method: "POST",
          headers: { "x-forwarded-for": "203.0.113.9" },
          body: JSON.stringify({ password }),
        }),
      );
    for (let i = 0; i < 5; i++) expect((await attempt("wrong")).status).toBe(401);
    expect((await attempt("correct-horse")).status).toBe(429);
    expect(jar.set).not.toHaveBeenCalled();
  });
});
