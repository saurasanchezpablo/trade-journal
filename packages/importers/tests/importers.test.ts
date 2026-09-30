import { describe, expect, it } from "vitest";
import { buildRoundTrips } from "@luxalgo/journal-core";
import { detectFormat, parseAuto } from "../src/detect";
import { parseWithMapping, readHeaders } from "../src/formats/generic";
import { parseMoney, parseQuantity } from "../src/numbers";
import { parseNumericCell } from "../src/history/csv";
import { parseTimestamp } from "../src/dates";
import { storedImportMetadata, type ImportedExecution } from "../src/types";

// NOTE: fixtures are synthetic, shaped after each platform's documented export.
// Validating against real exports is a launch-checklist item; every parser is
// alias-driven so a header fix is a one-line change.

const TRADEZELLA_CSV = `Open Date,Close Date,Symbol,Side,Volume,Entry Price,Exit Price,Net P&L,Commissions
2026-01-05 09:31:00,2026-01-05 10:15:00,AAPL,LONG,100,185.50,187.25,171.00,4.00
2026-01-06 09:45:00,2026-01-06 09:52:00,TSLA,SHORT,50,240.00,242.00,-102.50,2.50`;

const TRADERVUE_CSV = `Date,Time,Symbol,Quantity,Price,Side,Commission,TransFee,ECNFee
2026-01-05,09:31:00,AAPL,100,185.50,Buy,1.00,0.10,0.25
2026-01-05,10:15:00,AAPL,100,187.25,Sell,1.00,0.10,0.25`;

const TRADINGVIEW_CSV = `Symbol,Side,Type,Qty,Fill Price,Status,Commission,Closing Time
NASDAQ:AAPL,Buy,Market,10,185.50,Filled,0,2026-01-05 09:31:00
NASDAQ:AAPL,Sell,Market,10,187.25,Filled,0,2026-01-05 10:15:00
NASDAQ:MSFT,Buy,Limit,5,400.00,Cancelled,0,2026-01-05 11:00:00`;

const IBKR_CSV = `Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Stocks,USD,AAPL,"2026-01-05, 09:31:00",100,185.50,187.0,-18550,-1.00,18551,0,150,O
Trades,Data,Order,Stocks,USD,AAPL,"2026-01-05, 10:15:00",-100,187.25,187.0,18725,-1.00,-18551,173,-25,C
Trades,SubTotal,,Stocks,USD,AAPL,,0,,,175,-2,0,173,125,`;

const NINJA_CSV = `Instrument,Action,Quantity,Price,Time,Commission
ES 03-26,Buy,2,5000.25,2026-01-05 09:31:05,4.10
ES 03-26,Sell,2,5010.50,2026-01-05 09:45:10,4.10`;

const MT4_HTML = `<html><head><title>Statement</title></head><body>
<div>MetaTrader 4 - Closed Transactions:</div>
<table>
<tr><td>Ticket</td><td>Open Time</td><td>Type</td><td>Size</td><td>Item</td><td>Price</td><td>S / L</td><td>T / P</td><td>Close Time</td><td>Price</td><td>Commission</td><td>Taxes</td><td>Swap</td><td>Profit</td></tr>
<tr><td>12345</td><td>2026.01.05 09:31</td><td>buy</td><td>1.00</td><td>eurusd</td><td>1.09500</td><td>0.00000</td><td>0.00000</td><td>2026.01.05 14:20</td><td>1.09850</td><td>-7.00</td><td>0.00</td><td>-0.50</td><td>350.00</td></tr>
</table></body></html>`;

/** Round trips as the journal builds them from stored fills. */
const journalTrips = (executions: ImportedExecution[]) =>
  buildRoundTrips(
    executions.map((e, i) => ({
      ...e,
      id: `e${i}`,
      accountId: "a",
      source: "import" as const,
      importMetadata: storedImportMetadata(e),
    })),
  );

describe("importers turn any platform's export into normalized executions", () => {
  it("a TradeZella export migrates with net P&L preserved to the cent", () => {
    const result = parseAuto(TRADEZELLA_CSV)!;
    expect(result.format).toBe("tradezella");
    expect(result.executions).toHaveLength(4);

    const trades = buildRoundTrips(
      result.executions.map((e, i) => ({
        ...e,
        id: `e${i}`,
        accountId: "a",
        source: "import" as const,
      })),
    );
    expect(trades).toHaveLength(2);
    const aapl = trades.find((t) => t.symbol === "AAPL")!;
    const tsla = trades.find((t) => t.symbol === "TSLA")!;
    expect(aapl.netPnl).toBeCloseTo(171, 2);
    expect(tsla.netPnl).toBeCloseTo(-102.5, 2);
    expect(tsla.direction).toBe("short");
  });

  it("a TradeZella futures trade keeps its stated net P&L and never gets a negative fee", () => {
    const result =
      parseAuto(`Open Date,Close Date,Symbol,Side,Volume,Entry Price,Exit Price,Net P&L,Commissions
2026-01-05 09:31:00,2026-01-05 10:15:00,ES,LONG,1,5000,5002,96,4`)!;
    expect(result.executions.every((e) => e.fee >= 0)).toBe(true);
    const [trade] = journalTrips(result.executions);
    expect(trade!.fees).toBe(4);
    expect(trade!.netPnl).toBe(96);
  });

  it("a TradeZella row without a side is skipped, never assumed to be long", () => {
    const result = parseAuto(`Open Date,Close Date,Symbol,Volume,Entry Price,Exit Price,Net P&L
2026-01-05 09:31:00,2026-01-05 10:15:00,AAPL,100,185.50,187.25,175`)!;
    expect(result.executions).toHaveLength(0);
    expect(result.skippedRows).toBe(1);
    expect(result.warnings.join(" ")).toContain("side");
  });

  it("TradeZella's separate date and time columns keep the time of day", () => {
    const result =
      parseAuto(`Open Date,Open Time,Close Date,Close Time,Symbol,Side,Volume,Entry Price,Exit Price,Net P&L
2026-01-05,09:31:00,2026-01-05,10:15:00,AAPL,LONG,100,185.50,187.25,175`)!;
    expect(result.executions.map((e) => e.executedAt)).toEqual([
      "2026-01-05T09:31:00.000Z",
      "2026-01-05T10:15:00.000Z",
    ]);
    // What the earlier parser saved (midnight), so a reimport over it is refused.
    expect(result.executions[0]!.legacyExecutedAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("overlapping TradeZella trades on one symbol stay separate trades", () => {
    const result = parseAuto(`Open Date,Close Date,Symbol,Side,Volume,Entry Price,Exit Price,Net P&L
2026-01-05 09:31:00,2026-01-05 10:15:00,AAPL,LONG,100,185.50,187.25,175
2026-01-05 09:45:00,2026-01-05 10:30:00,AAPL,LONG,50,186.00,185.00,-50`)!;
    const trades = journalTrips(result.executions);
    expect(trades.map((t) => [t.quantity, t.netPnl]).sort()).toEqual([
      [100, 175],
      [50, -50],
    ]);
  });

  it("a Tradervue executions export imports fills with all three fee columns summed", () => {
    const result = parseAuto(TRADERVUE_CSV)!;
    expect(result.format).toBe("tradervue");
    expect(result.executions).toHaveLength(2);
    expect(result.executions[0]!.fee).toBeCloseTo(1.35, 6);
    expect(result.executions[0]!.side).toBe("buy");
  });

  it("a TradingView history import keeps filled orders and drops cancelled ones", () => {
    const result = parseAuto(TRADINGVIEW_CSV)!;
    expect(result.format).toBe("tradingview");
    expect(result.executions).toHaveLength(2);
    expect(result.executions[0]!.symbol).toBe("AAPL"); // exchange prefix stripped
    expect(result.skippedRows).toBe(1);
  });

  it("an IBKR activity statement imports only fill rows, with signed quantity as the side", () => {
    const result = parseAuto(IBKR_CSV)!;
    expect(result.format).toBe("ibkr");
    expect(result.executions).toHaveLength(2);
    expect(result.executions[0]!.side).toBe("buy");
    expect(result.executions[1]!.side).toBe("sell");
    expect(result.executions[0]!.assetClass).toBe("equity");
    expect(result.executions[0]!.fee).toBe(1);
  });

  it("a NinjaTrader export strips the contract month from the instrument", () => {
    const result = parseAuto(NINJA_CSV)!;
    expect(result.format).toBe("ninjatrader");
    expect(result.executions[0]!.symbol).toBe("ES");
  });

  it("a MetaTrader HTML statement keeps each trade's reported profit, commission and swap", () => {
    const result = parseAuto(MT4_HTML)!;
    expect(result.format).toBe("metatrader");
    expect(result.executions).toHaveLength(2);
    const trades = journalTrips(result.executions);
    expect(trades[0]!.symbol).toBe("EURUSD");
    expect(trades[0]!.fees).toBeCloseTo(7.5, 6);
    // Profit 350 is the statement's own figure; no contract size is needed.
    expect(trades[0]!.netPnl).toBeCloseTo(342.5, 6);
  });

  it("a swap credit on a MetaTrader statement adds to the trade instead of counting as a fee", () => {
    const result = parseAuto(MT4_HTML.replace("<td>-0.50</td>", "<td>+2.50</td>"))!;
    expect(result.format).toBe("metatrader");
    expect(result.executions.every((e) => e.fee >= 0)).toBe(true);
    const [trade] = journalTrips(result.executions);
    expect(trade!.fees).toBeCloseTo(4.5, 6);
    expect(trade!.netPnl).toBeCloseTo(345.5, 6); // 350 profit - 7 commission + 2.50 swap
  });

  it("MetaTrader statements keep the fill identity the earlier parser saved", () => {
    // Re-importing a statement imported before must match the rows it saved.
    const result = parseAuto(MT4_HTML)!;
    expect(
      result.executions.map((e) => [e.symbol, e.side, e.quantity, e.price, e.executedAt]),
    ).toEqual([
      ["EURUSD", "buy", 1, 1.095, "2026-01-05T09:31:00.000Z"],
      ["EURUSD", "sell", 1, 1.0985, "2026-01-05T14:20:00.000Z"],
    ]);
    expect(result.executions.every((e) => e.importMetadata === undefined)).toBe(true);
  });

  it("DAS short sells and covers import as sells and buys", () => {
    const result = parseAuto(`Symb,B/S,Qty,Price,Date,Time
AAPL,SS,100,185.50,2026-01-05,09:31:00
AAPL,BC,100,185.00,2026-01-05,09:45:00
MSFT,Short Sell,10,400,2026-01-05,10:00:00
MSFT,Cover,10,399,2026-01-05,10:05:00
TSLA,Sell Short,5,240,2026-01-05,11:00:00
TSLA,Buy to cover,5,239,2026-01-05,11:05:00`)!;
    expect(result.format).toBe("das-trader");
    expect(result.executions.map((e) => e.side)).toEqual([
      "sell",
      "buy",
      "sell",
      "buy",
      "sell",
      "buy",
    ]);
    expect(result.skippedRows).toBe(0);
  });

  it("a fill whose side is not recognized is skipped and the user is told", () => {
    const result = parseAuto(`Symb,B/S,Qty,Price,Date,Time
AAPL,B,100,185.50,2026-01-05,09:31:00
AAPL,XFER,100,185.00,2026-01-05,09:45:00`)!;
    expect(result.executions).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain('"XFER"');
  });

  it("an unknown file is not guessed at — it goes to the column mapper instead", () => {
    const weird = `When,Ticker,Way,Amount,Cost
2026-01-05 09:31:00,AAPL,bought,100,185.50`;
    expect(detectFormat(weird)).toBeNull();
    expect(readHeaders(weird)).toEqual(["When", "Ticker", "Way", "Amount", "Cost"]);
    const mapped = parseWithMapping(weird, {
      symbol: "Ticker",
      side: "Way",
      quantity: "Amount",
      price: "Cost",
      timestamp: "When",
    });
    expect(mapped.executions).toHaveLength(1);
    expect(mapped.executions[0]!.side).toBe("buy");
  });
});

describe("parsing primitives survive the mess real exports contain", () => {
  it("money values with symbols, parens, and thousands separators parse correctly", () => {
    expect(parseMoney("$1,234.56")).toBe(1234.56);
    expect(parseMoney("(45.20)")).toBe(-45.2);
    expect(parseMoney("1.234,56")).toBe(1234.56);
    expect(parseMoney("-12.5")).toBe(-12.5);
  });

  it("a minus sign after the currency symbol still makes the value negative", () => {
    expect(parseMoney("$-12.50")).toBe(-12.5);
    expect(parseMoney("-$12.50")).toBe(-12.5);
    expect(parseMoney("€ -3,5")).toBe(-3.5);
  });

  it("a comma that cannot be a thousands separator is a decimal comma", () => {
    expect(parseMoney("0,005")).toBe(0.005);
    expect(parseMoney("0,12345")).toBe(0.12345);
    expect(parseMoney("42000,50")).toBe(42000.5);
    expect(parseMoney("1.234,567")).toBe(1234.567);
    expect(parseMoney("1,234,567")).toBe(1234567);
    expect(parseQuantity("0,005")).toBe(0.005);
    // "12,345" alone is ambiguous: thousands unless the file uses decimal commas.
    expect(parseMoney("12,345")).toBe(12345);
    expect(parseMoney("12,345", ",")).toBe(12.345);
    expect(parseMoney("1.234", ",")).toBe(1234);
    expect(parseNumericCell("0,005")).toBe(0.005);
  });

  it("a file that proves decimal commas reads its ambiguous values the same way", () => {
    const result = parseAuto(`Date;Time;Symbol;Quantity;Price;Side
2026-01-05;09:31:00;BTCUSD;0,005;42000,50;Buy
2026-01-05;10:15:00;BTCUSD;1,005;42100,50;Buy`)!;
    expect(result.format).toBe("tradervue");
    expect(result.executions.map((e) => [e.quantity, e.price])).toEqual([
      [0.005, 42000.5],
      [1.005, 42100.5],
    ]);
    // The earlier parser read these quantities as 5 and 1005; a reimport over them is refused.
    expect(result.executions.map((e) => e.legacy)).toEqual([{ quantity: 5 }, { quantity: 1005 }]);
    expect(result.warnings).toEqual([]);
  });

  it("an ambiguous thousands comma in a file without decimals is read as thousands and flagged", () => {
    const result = parseAuto(`Date,Time,Symbol,Quantity,Price,Side
2026-01-05,09:31:00,AAPL,"1,500",185,Buy`)!;
    expect(result.executions[0]!.quantity).toBe(1500);
    expect(result.warnings.join(" ")).toContain("1,500");
  });

  it("naive timestamps are interpreted in the trader's timezone, not the server's", () => {
    // 09:31 New York in January is 14:31 UTC.
    expect(parseTimestamp("2026-01-05 09:31:00", "America/New_York")).toBe(
      "2026-01-05T14:31:00.000Z",
    );
    // US-style with meridiem.
    expect(parseTimestamp("01/05/2026 2:30:00 PM", "UTC")).toBe("2026-01-05T14:30:00.000Z");
    // Offsets are honored as-is.
    expect(parseTimestamp("2026-01-05T09:31:00-05:00")).toBe("2026-01-05T14:31:00.000Z");
  });
});

// Fixtures below are shaped from FIELD SOURCES: TradeNote's community broker
// parsers (github.com/Eleven-Trading/TradeNote) and a real-user TradeZella
// converter (github.com/drasticstatic/TradeZella_STB). See docs/importers.md.
describe("formats cross-checked against real-world parsers import correctly", () => {
  it("a Tradovate orders export keeps only Filled rows and reads Product as the symbol", () => {
    const csv = `orderId,Account,Date,Fill Time,B/S,Contract,Product,Filled Qty,Avg Fill Price,Status
1001,APEX123,08/20/2026,08/20/2026 09:31:05,Buy,ESU6,ES,2,5000.25,Filled
1002,APEX123,08/20/2026,,Buy,ESU6,ES,0,,Cancelled
1003,APEX123,08/20/2026,08/20/2026 09:45:10,Sell,ESU6,ES,2,5010.50,Filled`;
    const result = parseAuto(csv)!;
    expect(result.format).toBe("tradovate");
    expect(result.executions).toHaveLength(2);
    expect(result.executions[0]!.symbol).toBe("ES");
    expect(result.skippedRows).toBe(1);
  });

  it("a TopstepX export maps Bid/Ask to buy/sell", () => {
    const csv = `AccountName,ContractName,ExecutePrice,FilledAt,PositionDisposition,Side,Size,Status,Sub Type
TSX-1,/ESU6,5000.25,2026-08-20 09:31:05,Opening,Bid,2,Filled,Market
TSX-1,/ESU6,5010.50,2026-08-20 09:45:10,Closing,Ask,2,Filled,Market`;
    const result = parseAuto(csv)!;
    expect(result.format).toBe("topstepx");
    expect(result.executions).toHaveLength(2);
    expect(result.executions[0]!.side).toBe("buy");
    expect(result.executions[1]!.side).toBe("sell");
  });

  it("an IBKR Flex Query export parses its YYYYMMDD;HHmmss timestamps", () => {
    const csv = `ClientAccountID,Symbol,Date/Time,Buy/Sell,Quantity,Price,Commission,AssetClass,Code
U1234567,AAPL,20260105;093100,BUY,100,185.50,-1.00,STK,O
U1234567,AAPL,20260105;101500,SELL,-100,187.25,-1.00,STK,C`;
    const result = parseAuto(csv)!;
    expect(result.format).toBe("ibkr-flex");
    expect(result.executions).toHaveLength(2);
    expect(result.executions[0]!.executedAt).toBe("2026-01-05T09:31:00.000Z");
    expect(result.executions[0]!.fee).toBe(1);
  });

  it("a fill export's UTC timestamps stay UTC, and a reimport over the earlier reading is refused", () => {
    const result = parseAuto(
      `Symbol,Side,Type,Qty,Fill Price,Status,Commission,Closing Time
NASDAQ:AAPL,Buy,Market,10,185.50,Filled,0,2026-01-05 14:31:00 UTC`,
      { timeZone: "America/New_York" },
    )!;
    expect(result.executions[0]!.executedAt).toBe("2026-01-05T14:31:00.000Z");
    expect(result.executions[0]!.legacyExecutedAt).toBe("2026-01-05T19:31:00.000Z");
  });

  it("TradeZella time fields with a timezone abbreviation still parse", () => {
    expect(parseTimestamp("08/18/2026 09:31:00 EST", "America/New_York")).toBe(
      "2026-08-18T13:31:00.000Z",
    );
  });

  it("Webull's combined Filled/Total and Price/Avg Price columns split correctly", () => {
    const csv = `Symbol,Side,Status,Filled/Total Qty,Price/Avg Price,Filled Time
AAPL,Buy,Filled,5/10,185.00/185.50,08/20/2026 09:31:05
AAPL,Sell,Cancelled,0/10,0/0,`;
    const result = parseAuto(csv)!;
    expect(result.format).toBe("webull");
    expect(result.executions).toHaveLength(1);
    expect(result.executions[0]!.quantity).toBe(5); // filled, not total
    expect(result.executions[0]!.price).toBe(185.5); // avg fill price
  });
});
