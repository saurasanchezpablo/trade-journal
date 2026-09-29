import { handler, ok, requireValue } from "@/server/api";
import { decodeImageDataUrl } from "@/server/ai-images";
import { read, runAiObject } from "@/server/ai-structured";

const MAX_LEVELS = 20;
const CONFIDENCE = ["high", "medium", "low"] as const;

interface ReadLevel {
  kind: "line" | "zone";
  low: number;
  high: number;
  label: string;
  role: "support" | "resistance" | null;
  confidence: (typeof CONFIDENCE)[number];
  /** Why it was set aside, when it looks wrong for this chart. */
  doubt: string | null;
}

/**
 * Price levels read from a chart screenshot (yours or someone else's): horizontal lines and
 * zones with their prices, read off the price axis. They are offered as a list; only the
 * ones you tick become lines and zones on the chart.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as {
    image?: unknown;
    symbol?: unknown;
    lastPrice?: unknown;
  };
  requireValue(
    body && Object.keys(body).every((k) => ["image", "symbol", "lastPrice"].includes(k)),
    "Unknown field",
  );
  const image = decodeImageDataUrl(body.image);
  requireValue(image, "Choose a PNG, JPEG or WebP screenshot up to 4 MB.");
  const symbol = typeof body.symbol === "string" ? body.symbol.slice(0, 40) : "";
  const last =
    typeof body.lastPrice === "number" && Number.isFinite(body.lastPrice) && body.lastPrice > 0
      ? body.lastPrice
      : null;

  const prompt = `This is a screenshot of a trading chart${symbol ? ` that should be ${symbol}` : ""}. Read the price levels drawn or
labelled on it: horizontal lines, rays and labelled prices ("line", one price) and shaded
support/resistance zones ("zone", low and high). Read prices from the right-hand price axis
and any price labels; interpolate between axis ticks carefully. Label each from its text on
the chart, else by what it is (for example "resistance", "prior day high"). Give your
confidence in each price. Skip indicators, candles and trend lines that are not horizontal.
Also give the lowest and highest prices on the axis, and the symbol if it is shown.${last ? `\nThe instrument's current price is about ${last}.` : ""}`;

  const answer = await runAiObject({
    prompt,
    name: "chart_levels",
    images: [image],
    maxOutputTokens: 1500,
    schema: {
      type: "object",
      properties: {
        symbolShown: { type: ["string", "null"] },
        axis: {
          type: "object",
          properties: { low: { type: ["number", "null"] }, high: { type: ["number", "null"] } },
          required: ["low", "high"],
          additionalProperties: false,
        },
        levels: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["line", "zone"] },
              price: { type: ["number", "null"] },
              low: { type: ["number", "null"] },
              high: { type: ["number", "null"] },
              label: { type: "string" },
              role: { type: ["string", "null"], enum: ["support", "resistance", null] },
              confidence: { type: "string", enum: [...CONFIDENCE] },
            },
            required: ["kind", "price", "low", "high", "label", "role", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["symbolShown", "axis", "levels"],
      additionalProperties: false,
    },
    read: (value) => {
      const o = read.object(value);
      const axis = read.object(o.axis);
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
      const axisLow = num(axis.low);
      const axisHigh = num(axis.high);
      const levels: ReadLevel[] = [];
      for (const item of read.array(o.levels, MAX_LEVELS * 2)) {
        const l = read.object(item);
        const kind = read.oneOf(l.kind, ["line", "zone"] as const);
        let low = kind === "line" ? num(l.price) : num(l.low);
        let high = kind === "line" ? low : num(l.high);
        if (low === null || high === null) continue;
        if (low > high) [low, high] = [high, low];
        const doubts: string[] = [];
        // A price outside the axis it was read from, or far from the market, is doubtful.
        if (
          axisLow !== null &&
          axisHigh !== null &&
          (high < axisLow * 0.98 || low > axisHigh * 1.02)
        )
          doubts.push("outside the chart's price axis");
        if (last !== null && (high < last / 2 || low > last * 2))
          doubts.push(`far from the current price (${last})`);
        levels.push({
          kind,
          low,
          high,
          label: read.text(l.label, 60),
          role: l.role === "support" || l.role === "resistance" ? l.role : null,
          confidence: read.oneOf(l.confidence, CONFIDENCE),
          doubt: doubts.length ? doubts.join("; ") : null,
        });
      }
      return {
        symbolShown: typeof o.symbolShown === "string" ? read.text(o.symbolShown, 40) : null,
        axis: { low: axisLow, high: axisHigh },
        levels: levels.slice(0, MAX_LEVELS),
      };
    },
  });
  return ok(answer);
});
