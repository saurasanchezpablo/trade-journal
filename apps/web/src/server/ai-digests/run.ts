import { eq } from "drizzle-orm";
import { db, journalDays } from "@/db";
import { weekEnding } from "@/lib/journal-lessons";
import { aiConfigured } from "../ai";
import { readAiRequest } from "../ai-scope";
import { chatTurn } from "../ai-agent/chat";
import { createConversation } from "../ai-agent/store";
import { deliver as deliverAlert, type AlertNotification } from "../background-alerts/delivery";
import { weekContext } from "../journal-history";
import { recurringLessonsText } from "../lessons";
import { getTimeZone } from "../settings";
import { queryTrades } from "../trades-query";
import { summaryOf, type DigestKind } from "./schedule";
import { claimDigest, finishDigest, getDigestSettings, type Digest } from "./store";

/**
 * Writing and sending one digest: the AI chat agent writes it with its journal tools (so it
 * is saved as a conversation you can open and follow up on), then a short notification goes
 * to your browsers and webhook through the background alerts delivery.
 */

export interface DigestDeps {
  deliver: (notification: AlertNotification) => Promise<number>;
}

const defaults: DigestDeps = { deliver: deliverAlert };

const weekdayName = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

interface Plan {
  title: string;
  display: string;
  question: string;
  filters: Record<string, string>;
  kind: "day" | "journal";
  anchor: string | null;
  url: (conversationId: string) => string;
  /** Plain words for the notification when its summary is left out. */
  count: string;
}

/** What to ask for a period, or why there is nothing to review. */
function planFor(kind: DigestKind, period: string): Plan | { skip: string } {
  const timeZone = getTimeZone();
  if (kind === "day") {
    const closed = queryTrades({ from: period, to: period }).trades.filter(
      (t) => t.status !== "open",
    );
    const note = db.select().from(journalDays).where(eq(journalDays.date, period)).get()?.note;
    if (!closed.length && !note?.trim()) return { skip: "No closed trades or day note that day." };
    const title = `Session recap · ${weekdayName(period)} ${period}`;
    return {
      title,
      display: `Session recap for ${period} (scheduled)`,
      question: `Write my session recap for ${period} in first person ("I"), 120-200 words, markdown,
ending with a short "**Keep**" and "**Fix**" list. Read the day with get_day first. Compare
with my recent days only where it shows what was different today. This recap was scheduled:
be concrete about today's trades and plans.`,
      filters: {},
      kind: "day",
      anchor: period,
      url: (id) => `/journal/${period}?chat=${encodeURIComponent(id)}`,
      count: closed.length
        ? `${closed.length} trade${closed.length === 1 ? "" : "s"} reviewed`
        : "Your day note reviewed",
    };
  }
  const days = weekEnding(period);
  const { text, tradeCount } = weekContext(period, timeZone);
  if (!tradeCount && !text.includes("Keep:") && !text.includes("Fix:"))
    return { skip: "No closed trades or day lessons that week." };
  return {
    title: `Weekly review · ${days[0]} to ${period}`,
    display: `Weekly review for ${days[0]} to ${period} (scheduled)`,
    question: `Write my weekly trading review for ${days[0]} to ${period} in first person ("I"),
200-320 words, markdown with these sections: "**What worked**", "**What cost me**" (name
repeated mistakes and Fix items that came back), "**Plans**" (how often my graded scenarios
played out, and whether trades taken from a plan did better than the rest), and "**Next week**"
(at most three concrete rules). Each day of the week so far:

${text}

${recurringLessonsText(period)}

Where a lesson keeps coming back, say so with how many weeks in a row. Use the tools for detail where it helps (group_stats, find_trades, get_day).`,
    filters: { from: days[0]!, to: period },
    kind: "journal",
    anchor: null,
    url: (id) => `/reports?chat=${encodeURIComponent(id)}`,
    count: `${tradeCount} trade${tradeCount === 1 ? "" : "s"} reviewed`,
  };
}

/**
 * Write and send the digest for a period. Returns null when it is already claimed (sent,
 * or being written); `again` sends a finished one anew.
 */
export async function runDigest(
  kind: DigestKind,
  period: string,
  options: { again?: boolean; deps?: Partial<DigestDeps> } = {},
): Promise<Digest | null> {
  const deps = { ...defaults, ...options.deps };
  const digest = claimDigest(kind, period, options.again);
  if (!digest) return null;
  const result: Outcome = await write(kind, period, deps).catch((error: unknown) => ({
    status: "failed" as const,
    detail: error instanceof Error ? error.message : "The digest could not be written.",
  }));
  finishDigest(digest.id, result);
  return {
    ...digest,
    ...result,
    conversationId: result.conversationId ?? null,
    title: result.title ?? "",
    detail: result.detail ?? "",
    delivered: result.delivered ?? 0,
  };
}

interface Outcome {
  status: "sent" | "skipped" | "failed";
  conversationId?: string;
  title?: string;
  detail?: string;
  delivered?: number;
}

async function write(kind: DigestKind, period: string, deps: DigestDeps): Promise<Outcome> {
  if (!aiConfigured())
    return { status: "failed", detail: "AI is not configured: add a provider key in Settings." };
  const plan = planFor(kind, period);
  if ("skip" in plan) return { status: "skipped", detail: plan.skip };

  const scope = readAiRequest({ question: plan.display, filters: plan.filters }, "question");
  const conversation = createConversation({
    title: plan.title,
    kind: plan.kind,
    anchor: plan.anchor,
    filters: scope.filters,
    scopeLabel: scope.scope.label,
  });
  let text = "";
  let failure: string | null = null;
  for await (const event of chatTurn({
    scope,
    conversation,
    question: plan.question,
    display: plan.display,
  })) {
    if (event.type === "done") text = event.message.content;
    else if (event.type === "error") failure = event.message;
  }
  if (failure || !text.trim())
    return {
      status: "failed",
      conversationId: conversation.id,
      title: plan.title,
      detail: failure ?? "AI returned no text.",
    };

  const settings = getDigestSettings();
  const delivered = await deps.deliver({
    title: plan.title,
    body: settings.summaryInNotification
      ? summaryOf(text)
      : `${plan.count}. Tap to read it and ask follow-ups.`,
    tag: `digest-${kind}-${period}`,
    url: plan.url(conversation.id),
  });
  return {
    status: "sent",
    conversationId: conversation.id,
    title: plan.title,
    detail: delivered
      ? `Sent to ${delivered} device${delivered === 1 ? "" : "s"} or webhook${delivered === 1 ? "" : "s"}.`
      : "Written, but no browser or webhook is set up to receive it.",
    delivered,
  };
}
