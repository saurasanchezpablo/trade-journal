import type { Resolution } from "./market-data";

export interface CredentialField {
  key: string;
  label: string;
  environmentKey: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
}
export interface ProviderInfo {
  id: string;
  name: string;
  mode: "credentials" | "public" | "csv";
  description: string;
  symbolHint: string;
  fields: CredentialField[];
  datasets?: { value: string; label: string }[];
  resolutions?: Resolution[];
  /** The chart's symbol field can search this source's listing (`/api/market-data/symbols`). */
  searchable?: boolean;
}
export const MARKET_PROVIDERS: ProviderInfo[] = [
  {
    id: "london-strategic-edge",
    name: "London Strategic Edge",
    mode: "credentials",
    description:
      "Historical candles. Stock and ETF prices are split adjusted; coverage depends on your plan.",
    symbolHint: "Use the exact provider symbol, including the futures contract or currency pair.",
    fields: [{ key: "apiKey", label: "API key", environmentKey: "LSE_API_KEY" }],
  },
  {
    id: "alpaca",
    name: "Alpaca",
    mode: "credentials",
    description:
      "US stocks and crypto. Choose a stock or crypto feed; SIP requires appropriate data access. Stock prices are unadjusted.",
    symbolHint: "Stocks: AAPL. Crypto: BTC/USD; choose the Crypto dataset.",
    fields: [
      { key: "apiKey", label: "Key ID", environmentKey: "ALPACA_API_KEY" },
      { key: "secretKey", label: "Secret key", environmentKey: "ALPACA_SECRET_KEY" },
    ],
    datasets: [
      { value: "", label: "Choose a data feed" },
      { value: "iex", label: "IEX stocks" },
      { value: "sip", label: "SIP stocks" },
      { value: "crypto", label: "Crypto (US)" },
    ],
  },
  {
    id: "binance",
    name: "Binance",
    mode: "public",
    description:
      "Public Binance spot candles. No API key required. Availability depends on your region and the listed pair.",
    symbolHint:
      "Spot pairs use BTCUSDT or ETHUSDT. For a USD account, USDT and USDC count as dollars in estimates; other quote currencies must match the account.",
    searchable: true,
    fields: [],
  },
  {
    id: "bybit",
    name: "Bybit",
    mode: "public",
    description:
      "Public Bybit candles and live prices for perpetuals and futures, spot and inverse contracts. No API key required; availability depends on your region.",
    symbolHint:
      "Pick the market, then search its symbols (BTCUSDT). The same symbol can trade as a perpetual and on spot.",
    searchable: true,
    fields: [],
    datasets: [
      { value: "", label: "Choose a market" },
      { value: "linear", label: "Perpetuals and futures (USDT, USDC)" },
      { value: "spot", label: "Spot" },
      { value: "inverse", label: "Inverse (coin-margined)" },
    ],
  },
  {
    id: "coinbase",
    name: "Coinbase",
    mode: "public",
    description:
      "Public Coinbase Exchange spot candles. No API key required; intervals without trades may have no candle.",
    symbolHint: "Use a Coinbase Exchange product such as BTC-USD or ETH-USD.",
    searchable: true,
    fields: [],
  },
  {
    id: "okx",
    name: "OKX",
    mode: "public",
    description:
      "Public OKX candles for spot pairs and perpetual swaps, with years of 1-minute history. No API key required; availability depends on your region.",
    symbolHint:
      "Pick the market, then search its symbols: BTC-USDT on spot, BTC-USDT-SWAP for the perpetual.",
    searchable: true,
    fields: [],
    datasets: [
      { value: "", label: "Choose a market" },
      { value: "spot", label: "Spot" },
      { value: "swap", label: "Perpetual swaps" },
    ],
  },
  {
    id: "kraken",
    name: "Kraken",
    mode: "public",
    description:
      "Public Kraken candles for crypto and a dozen major currency pairs (EUR/USD, GBP/USD, USD/JPY...). No API key required, but only the latest 720 candles of each size: about 12 hours of 1m, 30 days of 1h, two years of 1d.",
    symbolHint: "Use a Kraken pair such as EURUSD, GBPUSD, USDJPY or XBTUSD.",
    searchable: true,
    fields: [],
  },
  {
    id: "nasdaq",
    name: "Nasdaq",
    mode: "public",
    description:
      "Daily candles for US stocks and ETFs from nasdaq.com, the last ten years, split adjusted. No API key required; not an official API, so it can change. For indices use Yahoo Finance.",
    symbolHint: "Pick what it is, then search: AAPL (stock) or SPY (ETF).",
    searchable: true,
    fields: [],
    resolutions: ["1d", "1w"],
    datasets: [
      { value: "", label: "Choose stock or ETF" },
      { value: "stocks", label: "Stock" },
      { value: "etf", label: "ETF" },
    ],
  },
  {
    id: "yahoo",
    name: "Yahoo Finance",
    mode: "public",
    description:
      "Stocks and ETFs worldwide, indices, futures, currency pairs and crypto. No API key required, but it is not an official API: Yahoo throttles it and refuses some networks. Intraday history is short (1m for 30 days, 5m to 30m for 60 days, 1h for two years); daily for the whole history.",
    symbolHint:
      "Use Yahoo symbols: AAPL, VOD.L (London), SAP.DE (Xetra), ^GSPC (S&P 500), ES=F (E-mini, front month), EURUSD=X, BTC-USD.",
    searchable: true,
    fields: [],
  },
  {
    id: "oanda",
    name: "OANDA",
    mode: "credentials",
    description:
      "Forex and CFD candles from your v20 account. Midpoint prices, UTC-aligned bars and tick-count volume; no spread or FX conversion is included.",
    symbolHint:
      "Use an OANDA instrument such as EUR_USD. Set the contract multiplier in Settings to match the units in your fills.",
    fields: [
      { key: "apiKey", label: "Access token", environmentKey: "OANDA_API_TOKEN" },
      { key: "accountId", label: "v20 account ID", environmentKey: "OANDA_ACCOUNT_ID" },
      {
        key: "environment",
        label: "Environment",
        environmentKey: "OANDA_ENVIRONMENT",
        defaultValue: "practice",
        options: [
          { value: "practice", label: "Practice" },
          { value: "live", label: "Live" },
        ],
      },
    ],
  },
  {
    id: "market-csv",
    name: "Market data CSV",
    mode: "csv",
    description:
      "Local OHLCV candle files. Upload market prices separately from your trade executions.",
    symbolHint:
      "Use the exact symbol and resolution recorded for the uploaded file. Select a dataset when files overlap.",
    fields: [],
  },
];
export const providerInfo = (id: string) => MARKET_PROVIDERS.find((item) => item.id === id);
