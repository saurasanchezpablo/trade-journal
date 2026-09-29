import { dayKeyOf } from "@luxalgo/journal-core";
import { bad, handler, ok, requireValue } from "@/server/api";
import { analysesPrompt, analysesUsed, analysisImages, linkedAnalyses } from "@/server/ai-analyses";
import { getTimeZone } from "@/server/settings";
import { runAi } from "@/server/ai";
import { streamedAnswer, wantsStream } from "@/server/ai-stream";
import { listExecutions } from "@/server/executions";
import { getTradeByKey, rowToTrade } from "@/server/trades-query";
import { tradeMarketContext } from "@/server/trade-context";
import { decodePngDataUrl } from "@/server/chart-analyses";

/** Critique one trade: entries, exits, sizing, and the trader's own annotations. */
export const POST = handler(async (request: Request) => {
  const { key, includeAnalyses, stream, chartImage } = (await request.json()) as {
    key?: string;
    includeAnalyses?: unknown;
    stream?: unknown;
    chartImage?: unknown;
  };
  const streamed = wantsStream(stream);
  // The trade's candle chart as the page shows it, when market candles are loaded there.
  const picture = chartImage === undefined ? null : decodePngDataUrl(chartImage);
  requireValue(chartImage === undefined || picture, "chartImage must be a PNG data URL");
  if (!key) return bad("key is required");
  requireValue(
    includeAnalyses === undefined || typeof includeAnalyses === "boolean",
    "includeAnalyses must be true or false",
  );
  const row = getTradeByKey(key);
  if (!row) return bad("Trade not found", 404);
  const trade = rowToTrade(row);
  const fills = listExecutions(row.accountId, trade.executionIds).sort((a, b) =>
    a.executedAt.localeCompare(b.executedAt),
  );

  // Linked: embedded in the trade's notes, or assigned to its entry day on its symbol.
  const linked =
    includeAnalyses === false
      ? []
      : await linkedAnalyses({
          notes: [row.notes],
          day: dayKeyOf(trade.openedAt, getTimeZone()),
          symbols: [trade.symbol],
        });

  // What the market did around the trade, from its candles (when a source is known).
  const market = await tradeMarketContext(trade, getTimeZone(), request.signal);

  const prompt = `Critique this single trade in under ${linked.length ? 220 : 150} words. Focus on execution quality visible in the
fills (entry clustering, scaling, exit discipline), risk (stop honored or not, R multiple),
and the trader's own tags/mistakes. End with one concrete instruction for the next
occurrence of this setup.${market.ok ? " Use the market context: where the entry sat in the day's range and against VWAP, and what the move against and in favour says about the stop and the exit." : ""}${linked.length ? " Say whether the entry, stop and exit respected the levels and zones in the linked chart analyses." : ""}

Trade: ${trade.symbol} ${trade.direction}, status ${trade.status}
Net P&L: ${trade.netPnl.toFixed(2)} (gross ${trade.grossPnl.toFixed(2)}, fees ${trade.fees.toFixed(2)})
Avg entry ${trade.avgEntry} → avg exit ${trade.avgExit ?? "still open"}
Planned stop: ${row.stopLoss ?? "none recorded"} | target: ${row.profitTarget ?? "none recorded"}
Rating: ${row.rating ?? "unrated"} | tags: ${(trade.annotations?.tags ?? []).join(", ") || "none"} | mistakes: ${(trade.annotations?.mistakes ?? []).join(", ") || "none"}
Notes: ${row.notes ?? "none"}

Fills:
${fills.map((fill) => `${fill.executedAt} ${fill.side} ${fill.quantity} @ ${fill.price}${fill.fee ? ` fee ${fill.fee}` : ""}`).join("\n")}

${market.ok ? `Market around the trade (${market.source}, ${market.resolution} candles):\n${market.text}${picture ? "\nThe first image is the trade's candle chart with its entries and exits." : ""}` : `Market context: unavailable (${market.reason}).`}

${analysesPrompt(linked, picture ? 1 : 0)}`;
  const ai = {
    prompt,
    maxOutputTokens: linked.length ? 1500 : 1200,
    // The trade's own chart first, then the analyses' snapshots.
    images: [...(picture ? [picture] : []), ...analysisImages(linked)],
  };
  const result = (critique: string) => ({ critique, analyses: analysesUsed(linked) });
  if (streamed) return streamedAnswer(request, ai, result);
  return ok(result(await runAi(ai.prompt, ai.maxOutputTokens, ai.images)));
});
