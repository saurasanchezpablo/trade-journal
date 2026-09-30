import { asc, eq } from "drizzle-orm";
import { accounts, db } from "@/db";
import { bad, handler, ok, requireValue } from "@/server/api";
import { ACCOUNT_KINDS, readAccountFields } from "@/server/account-fields";
import { encryptJson } from "@/server/crypto";
import { newId, nowIso } from "@/server/ids";
import { getTimeZone } from "@/server/settings";
import { syncAccount } from "@/server/sync";

export const GET = handler((request: Request) => {
  if (new URL(request.url).searchParams.get("summary") === "1") {
    return ok({
      accounts: db
        .select({
          id: accounts.id,
          name: accounts.name,
          broker: accounts.broker,
          archivedAt: accounts.archivedAt,
        })
        .from(accounts)
        .orderBy(asc(accounts.createdAt))
        .all(),
    });
  }
  const rows = db.select().from(accounts).orderBy(asc(accounts.createdAt)).all();
  return ok({
    timeZone: getTimeZone(),
    accounts: rows.map(({ credentialsEnc, ...safe }) => ({
      ...safe,
      connected: credentialsEnc !== null,
      snapshot: safe.snapshotJson ? JSON.parse(safe.snapshotJson) : null,
    })),
  });
});

export const POST = handler(async (request: Request) => {
  const raw = (await request.json()) as unknown;
  requireValue(
    raw && typeof raw === "object" && !Array.isArray(raw),
    "Enter valid account details.",
  );
  const body = raw as Record<string, unknown>;
  requireValue(
    ACCOUNT_KINDS.includes(body.kind as (typeof ACCOUNT_KINDS)[number]),
    "name and kind are required",
  );
  requireValue(body.name !== undefined, "name and kind are required");
  const kind = body.kind as (typeof ACCOUNT_KINDS)[number];
  const fields = readAccountFields(body);
  const credentials = body.credentials;
  if (kind === "sync") {
    requireValue(
      fields.broker &&
        credentials &&
        typeof credentials === "object" &&
        !Array.isArray(credentials) &&
        Object.values(credentials).every((value) => typeof value === "string"),
      "sync accounts need a broker and credentials",
    );
  }

  const id = newId();
  db.insert(accounts)
    .values({
      id,
      name: fields.name!,
      broker: fields.broker ?? "",
      kind,
      currency: fields.currency ?? "USD",
      initialBalance: fields.initialBalance ?? 0,
      profitCalcMethod: fields.profitCalcMethod ?? "fifo",
      credentialsEnc: kind === "sync" ? encryptJson(credentials) : null,
      autoSync: fields.autoSync ?? kind === "sync",
      createdAt: nowIso(),
    })
    .run();

  // First sync happens right away so the account isn't born empty.
  let sync = null;
  if (kind === "sync") {
    try {
      sync = await syncAccount(id);
    } catch (error) {
      // Bad credentials shouldn't strand a half-created account.
      db.delete(accounts).where(eq(accounts.id, id)).run();
      return bad(error instanceof Error ? error.message : "Broker connection failed", 502);
    }
  }
  return ok({ id, sync });
});
