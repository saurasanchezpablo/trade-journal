import { cookies } from "next/headers";
import {
  AUTH_COOKIE,
  authRequired,
  clientKey,
  oidcSession,
  passwordConfigured,
  recordSignIn,
  SESSION_MAX_AGE,
  sessionToken,
  signInPaused,
  verifyPassword,
  verifySession,
} from "@/server/auth";
import { bad, handler, ok } from "@/server/api";
import { oidcConfig } from "@/server/oidc/config";
import { reportConfigProblem } from "@/server/oidc/http";

/**
 * How to sign in and whether you are: the login page and the sign-out button read this.
 * It is public, and says nothing secret (no client id, secret or issuer).
 */
export const GET = handler(
  async () => {
    const token = (await cookies()).get(AUTH_COOKIE)?.value;
    const config = oidcConfig();
    const session = oidcSession(token);
    const signedIn = authRequired() ? verifySession(token) : false;
    return ok({
      required: authRequired(),
      password: passwordConfigured(),
      oidc: config.enabled
        ? config.ok
          ? { label: config.settings.label, problem: null }
          : { label: "Single sign-on", problem: reportConfigProblem(config.problem) }
        : null,
      session: signedIn
        ? session
          ? { method: "oidc", name: session.name, email: session.email }
          : { method: "password", name: "", email: "" }
        : null,
    });
  },
  { public: true },
);

export const POST = handler(
  async (request: Request) => {
    if (!passwordConfigured()) {
      if (authRequired()) return bad("Password sign-in is not enabled; use single sign-on.", 400);
      return ok({ authenticated: true });
    }
    const client = clientKey(request);
    if (signInPaused(client))
      return bad("Too many wrong passwords. Wait a few minutes and try again.", 429);
    const { password } = (await request.json()) as { password?: string };
    const valid = typeof password === "string" && password !== "" && verifyPassword(password);
    recordSignIn(client, valid);
    if (!valid) return bad("Wrong password", 401);
    const jar = await cookies();
    jar.set(AUTH_COOKIE, sessionToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return ok({ authenticated: true });
  },
  { public: true },
);
