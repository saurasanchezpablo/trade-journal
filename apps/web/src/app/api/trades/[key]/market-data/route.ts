import { accounts, db } from "@/db";
import { eq } from "drizzle-orm";
import { bad, handler, ok, requireValue } from "@/server/api";
import { connectionKey, providerFor } from "@/server/market-data/connections";
import { MarketDataError } from "@/server/market-data/provider";
import { getTradeByKey, rowToTrade } from "@/server/trades-query";
import { listExecutions } from "@/server/executions";
import { RESOLUTIONS, isResolution, type Resolution } from "@/lib/market-data";
import { estimateExcursions } from "@/lib/excursions";
import { tradeMarketFacts } from "@/lib/trade-context";
import type { AnnotatedTrade } from "@luxalgo/journal-core";
import type { MarketHistory } from "@/lib/market-data";

import { estimateFingerprint, saveEstimate, savedEstimates } from "@/server/market-data/estimates";

export const GET = handler(
  async (_request: Request, { params }: { params: Promise<{ key: string }> }) => {
    const { key } = await params;
    const row = getTradeByKey(key);
    if (!row) return bad("Trade not found", 404);
    return ok({ saved: savedEstimates([rowToTrade(row)]).get(key) ?? null });
  },
);

export const POST = handler(
  async (request: Request, { params }: { params: Promise<{ key: string }> }) => {
    const { key } = await params;
    const row = getTradeByKey(key);
    if (!row) return bad("Trade not found", 404);
    const body = await request.json();
    requireValue(body && typeof body.provider === "string", "Choose a market data provider.");
    requireValue(
      typeof body.symbol === "string" &&
        body.symbol.trim().length > 0 &&
        body.symbol.length <= 100 &&
        !/[\x00-\x1f]/.test(body.symbol),
      "Enter the provider's exact instrument symbol.",
    );
    requireValue(
      body.dataset === undefined ||
        (typeof body.dataset === "string" && /^[a-zA-Z0-9_-]{0,80}$/.test(body.dataset)),
      "Invalid dataset.",
    );
    requireValue(isResolution(body.resolution), "Choose a supported candle resolution.");
    requireValue(
      body.basisConfirmed === undefined || typeof body.basisConfirmed === "boolean",
      "Invalid price basis confirmation.",
    );
    requireValue(
      body.estimateOnly === undefined || typeof body.estimateOnly === "boolean",
      "Invalid response mode.",
    );
    requireValue(
      row.assetClass !== "option",
      "Option contract history is not supported by this connector yet. An underlying's candles cannot stand in for option prices.",
    );
    // An open trade shows its candles up to now; estimates need it closed.
    const opened = Date.parse(row.openedAt),
      closed = row.closedAt ? Date.parse(row.closedAt) : Date.now();
    requireValue(
      Number.isFinite(opened) && Number.isFinite(closed) && closed > opened && opened <= Date.now(),
      "Trade must have valid past entry and exit timestamps.",
    );
    // Candles before the entry and after the exit, so the trade is seen in its market (a
    // five-minute trade on 1m candles is otherwise five candles). Estimates only read the
    // candles between entry and exit.
    const step = RESOLUTIONS[body.resolution as Resolution];
    const pad = Math.max(30 * step, Math.round((closed - opened) / 4));
    const from = Math.floor((opened - pad) / step) * step,
      to = Math.min(Date.now(), closed + pad);
    try {
      const provider = providerFor(body.provider);
      // Crypto exchanges: a coin booked as a CFD or "other" (a broker's BTCUSD) still has
      // their candles; the prices can differ from the broker's, which the page says.
      const bookedElsewhere =
        ["binance", "bybit", "coinbase"].includes(provider.id) &&
        row.assetClass != null &&
        row.assetClass !== "crypto";
      if (["binance", "bybit", "coinbase"].includes(provider.id))
        requireValue(
          row.assetClass == null || ["crypto", "cfd", "other", "forex"].includes(row.assetClass),
          "This provider supplies crypto candles only. Choose a crypto trade.",
        );
      if (provider.id === "alpaca")
        requireValue(
          row.assetClass == null ||
            (body.dataset === "crypto" ? row.assetClass === "crypto" : row.assetClass === "equity"),
          "Choose the Alpaca dataset that matches this trade's asset class.",
        );
      if (provider.id === "oanda")
        requireValue(
          row.assetClass == null || ["forex", "cfd"].includes(row.assetClass),
          "OANDA supports forex and CFD instruments.",
        );
      const trade = rowToTrade(row);
      const fingerprint = estimateFingerprint(trade);
      const history = await provider.history(
        {
          symbol: body.symbol.trim(),
          dataset: body.dataset || undefined,
          resolution: body.resolution,
          from,
          to,
          signal: request.signal,
        },
        connectionKey(provider.id),
      );
      const accountCurrency = db
        .select({ currency: accounts.currency })
        .from(accounts)
        .where(eq(accounts.id, row.accountId))
        .get()?.currency;
      // Dollar stablecoins count as dollars (they trade within a fraction of a cent of it).
      const quote = history.quoteCurrency;
      const exact = !quote || quote === accountCurrency;
      const dollars =
        !exact &&
        accountCurrency === "USD" &&
        ["USDT", "USDC", "FDUSD", "BUSD", "USD"].includes(quote!);
      const currencyMatches = exact || dollars;
      // A coin on a crypto exchange: one unit is one coin (manual trades carry no asset class).
      const onExchange = ["binance", "bybit", "coinbase"].includes(provider.id);
      const estimated =
        onExchange && trade.contractMultiplier == null && trade.assetClass == null
          ? { ...trade, assetClass: "crypto" as const }
          : trade;
      const fills = trade.executionIds.length
        ? listExecutions(row.accountId, trade.executionIds)
        : [];
      // Worked out for every load, to show; saved for Reports only when you confirm the basis.
      const estimate = estimateExcursions(estimated, fills, history, currencyMatches);
      estimate.priceMove = estimate.priceBasisMismatch ? null : priceMove(trade, history);
      if (bookedElsewhere)
        estimate.warnings.unshift(
          `This trade is booked as ${row.assetClass === "other" ? "another asset class" : `a ${row.assetClass === "cfd" ? "CFD" : "forex"} instrument`}; exchange prices can differ from your broker's.`,
        );
      if (dollars)
        estimate.warnings.unshift(
          `The candles are quoted in ${quote}, counted as the account's USD; stablecoins can drift slightly from the dollar.`,
        );
      if (!currencyMatches)
        estimate.warnings.unshift(
          `The candle quote currency (${quote}) differs from this account (${accountCurrency}). Monetary estimates are unavailable; no FX conversion is applied.`,
        );
      const save = body.basisConfirmed === true && estimate.mae !== null && estimate.mfe !== null;
      const current = getTradeByKey(key);
      if (save && current && estimateFingerprint(rowToTrade(current)) === fingerprint)
        saveEstimate(trade, { ...history, estimate }, fingerprint);
      estimate.saved = save;
      if (!save && estimate.mae !== null)
        estimate.warnings.push(
          "Shown here, not saved to Reports: tick the confirmation and load again to save it.",
        );
      if (body.estimateOnly) {
        const { bars: _bars, ...metadata } = history;
        return ok({ ...metadata, estimate });
      }
      return ok({ ...history, estimate });
    } catch (error) {
      if (error instanceof MarketDataError) return bad(error.message, 502);
      throw error;
    }
  },
);

/** The price move while open, from the candles alone (any currency or contract size). */
function priceMove(trade: AnnotatedTrade, history: MarketHistory) {
  const step = RESOLUTIONS[history.resolution];
  const facts = tradeMarketFacts(
    {
      direction: trade.direction,
      avgEntry: trade.avgEntry,
      avgExit: trade.avgExit ?? null,
      openedAt: trade.openedAt,
      closedAt: trade.closedAt ?? null,
    },
    history.bars,
    Date.parse(trade.openedAt),
    step,
  );
  if (facts.mae === null || facts.mfe === null || !(trade.avgEntry > 0)) return null;
  return {
    adverse: facts.mae,
    favorable: facts.mfe,
    adversePct: facts.mae / trade.avgEntry,
    favorablePct: facts.mfe / trade.avgEntry,
  };
}
