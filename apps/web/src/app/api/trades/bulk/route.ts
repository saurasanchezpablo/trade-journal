import { eq, inArray } from "drizzle-orm";
import { db, playbooks, trades } from "@/db";
import { handler, ok, requireValue } from "@/server/api";
import { deleteExecutionsForTrades } from "@/server/executions";
import { nowIso } from "@/server/ids";
import { requireObject } from "@/server/request-fields";

const ACTIONS = ["review", "unreview", "tag", "untag", "playbook", "delete"] as const;
type Action = (typeof ACTIONS)[number];
const MAX_KEYS = 10_000;
/** Same limits as a single trade's tags (PATCH /api/trades/[key]). */
const MAX_TAG_LENGTH = 200;
const MAX_TAGS = 100;

const parseList = (json: string | null): string[] => {
  if (!json) return [];
  try {
    const value = JSON.parse(json) as unknown;
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
};

export const POST = handler(async (request: Request) => {
  const body = requireObject(await request.json(), "Enter a valid bulk action.");
  requireValue(
    Array.isArray(body.keys) &&
      body.keys.length > 0 &&
      body.keys.length <= MAX_KEYS &&
      body.keys.every((key) => typeof key === "string" && key.length > 0 && key.length <= 2000),
    "keys are required",
  );
  requireValue(ACTIONS.includes(body.action as Action), "Unknown action");
  const keys = [...new Set(body.keys as string[])];
  const action = body.action as Action;
  const rows: (typeof trades.$inferSelect)[] = [];
  for (let i = 0; i < keys.length; i += 500)
    rows.push(
      ...db
        .select()
        .from(trades)
        .where(inArray(trades.key, keys.slice(i, i + 500)))
        .all(),
    );

  switch (action) {
    case "review":
    case "unreview": {
      const reviewedAt = action === "review" ? nowIso() : null;
      db.transaction((tx) => {
        for (const row of rows)
          tx.update(trades).set({ reviewedAt }).where(eq(trades.key, row.key)).run();
      });
      return ok({ updated: rows.length });
    }
    case "tag":
    case "untag": {
      requireValue(
        typeof body.tag === "string" &&
          body.tag.trim().length > 0 &&
          body.tag.trim().length <= MAX_TAG_LENGTH,
        `tag is required (at most ${MAX_TAG_LENGTH} characters)`,
      );
      const tag = body.tag.trim();
      db.transaction((tx) => {
        for (const row of rows) {
          const tags = new Set(parseList(row.tagsJson));
          if (action === "tag") tags.add(tag);
          else tags.delete(tag);
          requireValue(tags.size <= MAX_TAGS, `A trade can have at most ${MAX_TAGS} tags.`);
          tx.update(trades)
            .set({ tagsJson: JSON.stringify([...tags]) })
            .where(eq(trades.key, row.key))
            .run();
        }
      });
      return ok({ updated: rows.length });
    }
    case "playbook": {
      requireValue(
        body.playbookId === undefined ||
          body.playbookId === null ||
          (typeof body.playbookId === "string" &&
            db.select().from(playbooks).where(eq(playbooks.id, body.playbookId)).get()),
        "Playbook not found.",
      );
      const playbookId = (body.playbookId as string | null | undefined) ?? null;
      db.transaction((tx) => {
        for (const row of rows)
          tx.update(trades).set({ playbookId }).where(eq(trades.key, row.key)).run();
      });
      return ok({ updated: rows.length });
    }
    case "delete": {
      const byAccount = new Map<string, string[]>();
      for (const row of rows) {
        const ids = parseList(row.executionIdsJson);
        byAccount.set(row.accountId, [...(byAccount.get(row.accountId) ?? []), ...ids]);
      }
      db.transaction(() => {
        for (const [accountId, executionIds] of byAccount) {
          deleteExecutionsForTrades(accountId, executionIds);
        }
      });
      return ok({ deleted: rows.length });
    }
  }
});
