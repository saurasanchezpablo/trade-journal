import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { oidcConfig, oidcEnabled } from "./oidc/config";
import { findSession, OIDC_SESSION_PREFIX, type SessionInfo } from "./oidc/store";

/**
 * Single-user auth, optional by design: it's your journal on your box. Set
 * JOURNAL_PASSWORD to require a login. A password session cookie carries when it was issued
 * and a random nonce, signed with a key derived (scrypt) from the password and
 * JOURNAL_SECRET: rotating the password invalidates every session, the server refuses one
 * older than 30 days, and a copied cookie is slow to test passwords against. Set JOURNAL_OIDC_ISSUER
 * (see server/oidc) to sign in through an OpenID Connect provider instead or as well;
 * those sessions are random ids stored server-side, ended by signing out.
 */
export const AUTH_COOKIE = "journal_session";

export const passwordConfigured = (): boolean => Boolean(process.env.JOURNAL_PASSWORD);

/**
 * Whether the journal requires a sign-in. An OIDC issuer counts even when the rest of its
 * configuration is wrong: a broken sign-in keeps the journal locked, never open.
 */
export const authRequired = (): boolean => passwordConfigured() || oidcEnabled();

/** How long a password session lasts, in seconds (the cookie's max age too). */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

let signingKey: { from: string; key: Buffer } | null = null;
/** Derived once per password (scrypt is deliberately slow), then reused. */
const sessionKey = (): Buffer => {
  const from = `${process.env.JOURNAL_PASSWORD ?? ""}\u0000${process.env.JOURNAL_SECRET ?? ""}`;
  if (signingKey?.from !== from)
    signingKey = { from, key: scryptSync(from, "journal-session-v2", 32) };
  return signingKey.key;
};
const sign = (payload: string) =>
  createHmac("sha256", sessionKey()).update(payload).digest("base64url");

/** A new password session: `v2.<issued, seconds>.<nonce>.<signature>`. */
export const sessionToken = (now = Date.now()): string => {
  const payload = `v2.${Math.floor(now / 1000)}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
};

const sameBytes = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** Compares digests, so the time taken says nothing about the password's length. */
export const verifyPassword = (candidate: string): boolean =>
  passwordConfigured() && sameBytes(digest(process.env.JOURNAL_PASSWORD ?? ""), digest(candidate));

const passwordSession = (token: string, now = Date.now()) => {
  if (!passwordConfigured()) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v2") return false;
  const issued = Number(parts[1]);
  const age = now / 1000 - issued;
  // A few minutes of clock skew either way, never older than the session lasts.
  if (!Number.isSafeInteger(issued) || age < -300 || age > SESSION_MAX_AGE) return false;
  return sameBytes(
    Buffer.from(sign(parts.slice(0, 3).join(".")), "utf8"),
    Buffer.from(parts[3]!, "utf8"),
  );
};

/** The signed-in OIDC session behind a cookie, when sign-in is configured and it is live. */
export const oidcSession = (token: string | undefined): SessionInfo | null => {
  if (!token?.startsWith(OIDC_SESSION_PREFIX)) return null;
  const config = oidcConfig();
  if (!config.enabled || !config.ok) return null;
  return findSession(token, config.settings.issuer.href);
};

export const verifySession = (token: string | undefined, now = Date.now()): boolean => {
  if (!authRequired()) return true;
  if (!token) return false;
  if (token.startsWith(OIDC_SESSION_PREFIX)) return oidcSession(token) !== null;
  return passwordSession(token, now);
};

const FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;
const failures = new Map<string, { count: number; last: number }>();
/** Who is trying to sign in, as far as the request tells (the proxy's client first). */
export const clientKey = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  request.headers.get("x-real-ip") ||
  "direct";
/** Five wrong passwords in 15 minutes from one client pause its attempts. */
export const signInPaused = (client: string, now = Date.now()): boolean => {
  const entry = failures.get(client);
  if (entry && now - entry.last > FAILURE_WINDOW_MS) failures.delete(client);
  return (failures.get(client)?.count ?? 0) >= FAILURE_LIMIT;
};
export const recordSignIn = (client: string, succeeded: boolean, now = Date.now()): void => {
  if (succeeded) {
    failures.delete(client);
    return;
  }
  if (failures.size > 1000) failures.clear();
  const entry = failures.get(client);
  failures.set(client, { count: (entry?.count ?? 0) + 1, last: now });
};
