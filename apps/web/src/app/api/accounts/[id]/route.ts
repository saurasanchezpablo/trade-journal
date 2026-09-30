import { eq } from "drizzle-orm";
import { accounts, db } from "@/db";
import { bad, handler, ok, requireValue } from "@/server/api";
import { readAccountFields } from "@/server/account-fields";
import { clearAccountData } from "@/server/account-data";
import { rebuildAccount } from "@/server/rebuild";

type Params = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const account = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!account) return bad("Account not found", 404);

  const body = (await request.json()) as unknown;
  requireValue(
    body && typeof body === "object" && !Array.isArray(body),
    "Enter valid account settings.",
  );
  const patch = readAccountFields(body as Record<string, unknown>);

  db.transaction(() => {
    if (Object.keys(patch).length > 0) {
      db.update(accounts).set(patch).where(eq(accounts.id, id)).run();
    }
    // A new profit-calc method changes per-exit attribution, so recompute.
    if (patch.profitCalcMethod && patch.profitCalcMethod !== account.profitCalcMethod) {
      rebuildAccount(id);
    }
  });
  return ok({ updated: true });
});

export const DELETE = handler(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  clearAccountData(id, { deleteAccount: true });
  return ok({ deleted: true });
});
