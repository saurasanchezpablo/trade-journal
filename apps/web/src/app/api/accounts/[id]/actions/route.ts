import { eq } from "drizzle-orm";
import { accounts, db } from "@/db";
import { bad, handler, ok, requireValue } from "@/server/api";
import { clearAccountData, transferAccountData } from "@/server/account-data";
import { nowIso } from "@/server/ids";
import { syncAccount } from "@/server/sync";

type Params = { params: Promise<{ id: string }> };

const ACTIONS = ["archive", "unarchive", "clear", "sync", "transfer"] as const;
type Action = (typeof ACTIONS)[number];

export const POST = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const account = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!account) return bad("Account not found", 404);
  const body = (await request.json()) as { action?: unknown; toAccountId?: unknown } | null;
  requireValue(
    body && typeof body === "object" && ACTIONS.includes(body.action as Action),
    "Unknown action",
  );

  switch (body.action as Action) {
    case "archive":
      db.update(accounts).set({ archivedAt: nowIso() }).where(eq(accounts.id, id)).run();
      return ok({ archived: true });
    case "unarchive":
      db.update(accounts).set({ archivedAt: null }).where(eq(accounts.id, id)).run();
      return ok({ archived: false });
    case "clear":
      clearAccountData(id);
      return ok({ cleared: true });
    case "sync":
      return ok({ sync: await syncAccount(id) });
    case "transfer": {
      requireValue(
        typeof body.toAccountId === "string" && body.toAccountId,
        "toAccountId is required",
      );
      const destinationId = body.toAccountId;
      const destination = db.select().from(accounts).where(eq(accounts.id, destinationId)).get();
      if (!destination) return bad("Destination account not found", 404);
      return ok({ transferred: true, ...transferAccountData(id, destinationId) });
    }
  }
});
