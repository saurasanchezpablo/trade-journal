import { eq } from "drizzle-orm";
import { db, playbooks } from "@/db";
import { bad, handler, ok, requireValue } from "@/server/api";
import { decodePngDataUrl } from "@/server/chart-analyses";
import { listExecutions } from "@/server/executions";
import { read, runAiObject } from "@/server/ai-structured";
import { getTimeZone } from "@/server/settings";
import { tradeMarketContext } from "@/server/trade-context";
import { getTradeByKey, rowToTrade } from "@/server/trades-query";

const VERDICTS = ["followed", "broken", "unclear"] as const;
const MAX_RULES = 40;

/**
 * Check one trade against its playbook's written rules: for each rule, followed, broken or
 * unclear, with the evidence. Only suggestions: the trade's rule review changes when you
 * apply them.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as { key?: unknown; chartImage?: unknown };
  requireValue(body && typeof body.key === "string", "key is required");
  requireValue(
    Object.keys(body).every((k) => ["key", "chartImage"].includes(k)),
    "Unknown playbook check field",
  );
  const picture = body.chartImage === undefined ? null : decodePngDataUrl(body.chartImage);
  requireValue(body.chartImage === undefined || picture, "chartImage must be a PNG data URL");
  const row = getTradeByKey(body.key);
  if (!row) return bad("Trade not found", 404);
  const book = row.playbookId
    ? db.select().from(playbooks).where(eq(playbooks.id, row.playbookId)).get()
    : undefined;
  if (!book) return bad("Assign a playbook to this trade first.");
  let rules: string[] = [];
  try {
    rules = [...new Set(JSON.parse(book.rulesJson) as string[])].filter(
      (r) => typeof r === "string" && r.trim(),
    );
  } catch {
    rules = [];
  }
  if (!rules.length) return bad("This playbook has no written rules to check.");
  rules = rules.slice(0, MAX_RULES);

  const trade = rowToTrade(row);
  const timeZone = getTimeZone();
  const fills = trade.executionIds.length
    ? listExecutions(row.accountId, trade.executionIds).sort((a, b) =>
        a.executedAt.localeCompare(b.executedAt),
      )
    : [];
  const market = await tradeMarketContext(trade, timeZone, request.signal);

  const prompt = `Check this trade against the trader's playbook ${JSON.stringify(book.name)}. For each numbered
rule, answer "followed", "broken" or "unclear", with one short sentence of evidence from the
facts below (a fill time, a price, the stop, a note, the market context). Say "unclear" when
the facts do not show it; never assume. Then a one-sentence summary of where the trade
deviated, if anywhere.

Playbook description: ${book.description.trim() || "none"}
Rules:
${rules.map((rule, i) => `${i + 1}. ${rule}`).join("\n")}

Trade: ${trade.symbol} ${trade.direction}, ${trade.status}, net ${trade.netPnl.toFixed(2)}
Opened ${trade.openedAt}, closed ${trade.closedAt ?? "still open"} (UTC; journal timezone ${timeZone})
Avg entry ${trade.avgEntry}, avg exit ${trade.avgExit ?? "open"}, quantity ${trade.quantity}
Planned stop: ${row.stopLoss ?? "none recorded"} | target: ${row.profitTarget ?? "none recorded"}
Tags: ${(trade.annotations?.tags ?? []).join(", ") || "none"} | mistakes: ${(trade.annotations?.mistakes ?? []).join(", ") || "none"}
Notes: ${row.notes?.trim().slice(0, 4000) || "none"}
Fills:
${fills.map((f) => `${f.executedAt} ${f.side} ${f.quantity} @ ${f.price}`).join("\n") || "none"}

${market.ok ? `Market around the trade (${market.source}, ${market.resolution} candles):\n${market.text}` : `Market context: unavailable (${market.reason}).`}${picture ? "\nThe image is the trade's candle chart with its entries and exits." : ""}`;

  const answer = await runAiObject({
    prompt,
    name: "playbook_check",
    schema: {
      type: "object",
      properties: {
        checks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rule: { type: "integer", description: "The rule's number." },
              verdict: { type: "string", enum: [...VERDICTS] },
              reason: { type: "string" },
            },
            required: ["rule", "verdict", "reason"],
            additionalProperties: false,
          },
        },
        summary: { type: "string" },
      },
      required: ["checks", "summary"],
      additionalProperties: false,
    },
    images: picture ? [picture] : [],
    read: (value) => {
      const o = read.object(value);
      const checks = new Map<number, { verdict: (typeof VERDICTS)[number]; reason: string }>();
      for (const item of read.array(o.checks, MAX_RULES * 2)) {
        const c = read.object(item);
        const index = read.number(c.rule);
        if (!Number.isInteger(index) || index < 1 || index > rules.length) continue;
        checks.set(index, {
          verdict: read.oneOf(c.verdict, VERDICTS),
          reason: read.text(c.reason, 400),
        });
      }
      return { checks, summary: read.text(o.summary, 600) };
    },
  });
  return ok({
    playbook: book.name,
    summary: answer.summary,
    // Every rule, in order; one the AI skipped is unclear.
    checks: rules.map((rule, i) => ({
      rule,
      ...(answer.checks.get(i + 1) ?? { verdict: "unclear", reason: "Not assessed by the AI." }),
    })),
    marketContext: market.ok,
  });
});
