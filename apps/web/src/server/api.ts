import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, authRequired, verifySession } from "./auth";

export class RequestError extends Error {}
export function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RequestError(message);
}

export const ok = (data: unknown, init?: ResponseInit) => {
  const headers = new Headers(init?.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(data, { ...init, headers });
};

export const bad = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A change sent by another site's page. Without it, any page you visit could post to the
 * journal (a plain-text body needs no preflight, and the journal is open by default). Browsers
 * say where a request came from in Sec-Fetch-Site, which proxies leave alone; older ones send
 * Origin, compared with the host the request reached. Scripts and servers send neither.
 */
export const crossSiteChange = (request: Request): boolean => {
  if (READS.has(request.method.toUpperCase())) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (origin === "null") return true;
  let from: string;
  try {
    from = new URL(origin).host;
  } catch {
    return true;
  }
  const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host")];
  try {
    if (process.env.JOURNAL_PUBLIC_URL) hosts.push(new URL(process.env.JOURNAL_PUBLIC_URL).host);
  } catch {
    // A malformed public URL adds nothing to compare with.
  }
  return !hosts.some((host) => host?.split(",")[0]?.trim() === from);
};

/** Route-handler wrapper: uniform error JSON instead of HTML 500 pages. */
export const handler =
  <A extends unknown[]>(
    fn: (...args: A) => Promise<Response> | Response,
    options: { public?: boolean } = {},
  ) =>
  async (...args: A): Promise<Response> => {
    try {
      const request = args[0] instanceof Request ? args[0] : null;
      if (request && crossSiteChange(request))
        return bad("Changes can only come from the journal's own pages.", 403);
      if (!options.public && authRequired()) {
        const token = (await cookies()).get(AUTH_COOKIE)?.value;
        if (!verifySession(token)) return bad("Unauthorized", 401);
      }
      return await fn(...args);
    } catch (error) {
      if (error instanceof RequestError) return bad(error.message, 400);
      // request.json() on a malformed body.
      if (error instanceof SyntaxError) return bad("The request body is not valid JSON.", 400);
      // Raw database errors name tables and columns; they stay in the server log.
      if ((error as { code?: unknown })?.code?.toString().startsWith("SQLITE_")) {
        console.error(error);
        return bad("The journal could not save this change.", 500);
      }
      const message = error instanceof Error ? error.message : "Internal error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
