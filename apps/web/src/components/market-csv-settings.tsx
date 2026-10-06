"use client";
import { useState } from "react";
import { MAX_CSV_BYTES, type MarketCsvDataset } from "@/lib/market-csv";
import { RESOLUTIONS, type MarketBar, type Resolution } from "@/lib/market-data";
import { postJson, useApi } from "@/lib/use-api";
import { decodeImportFile } from "@/lib/decode-import";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { OptionSelect } from "./ui/option-select";
import { MonetaryValue } from "./privacy";
import { useI18n } from "./i18n";
interface Preview {
  count: number;
  from: string;
  to: string;
  sample: MarketBar[];
}
export function MarketCsvSettings({ onChange }: { onChange: () => void }) {
  const { t, tx } = useI18n();
  const {
    data,
    refresh,
    error: listError,
  } = useApi<{ datasets: MarketCsvDataset[] }>("/api/market-data/csv");
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [symbol, setSymbol] = useState("");
  const [resolution, setResolution] = useState<Resolution | "">("");
  const [currency, setCurrency] = useState("");
  const [priceBasis, setPriceBasis] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const change = () => {
    setPreview(null);
    setMessage("");
    setError("");
  };
  const act = async (action: "preview" | "import" | "remove", id?: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      // Removing names the dataset only; it never re-sends the chosen file.
      const body = await postJson<Preview>(
        "/api/market-data/csv",
        action === "remove"
          ? { action, id }
          : { action, id, ...file, symbol, resolution, currency, priceBasis },
      );
      if (action === "preview") setPreview(body);
      else {
        setPreview(null);
        setMessage(
          action === "import"
            ? t("Market candles imported. Choose Market data CSV on a trade or in Reports.")
            : t("Dataset and its saved estimates removed."),
        );
        refresh();
        onChange();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("CSV request failed."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-lg border p-3" id="market-csv">
      <h3 className="text-sm font-medium">{t("Market data CSV")}</h3>
      <p className="text-xs text-muted-foreground">
        {t(
          "Upload one instrument and candle resolution per file, up to 5 MB / 50,000 rows. Required columns: time, open, high, low, close. Volume is optional. Time is the bar open: ISO-8601 with timezone, Unix seconds or milliseconds. Daily bars must start at 00:00 UTC. These are market candles, separate from trade execution imports.",
        )}
      </p>
      <a className="text-xs underline" href="/market-data-template.csv" download>
        {t("Download generic CSV header template")}
      </a>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="candle-file">{t("Candle CSV")}</Label>
          <Input
            id="candle-file"
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            disabled={busy}
            onChange={async (event) => {
              const selected = event.target.files?.[0];
              change();
              setFile(null);
              if (!selected) return;
              if (selected.size > MAX_CSV_BYTES) {
                setError(t("Use a CSV smaller than 5 MB."));
                return;
              }
              setBusy(true);
              try {
                setFile({
                  name: selected.name,
                  content: decodeImportFile(await selected.arrayBuffer()),
                });
              } catch {
                setError(t("Could not read this file."));
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="candle-symbol">{t("Instrument symbol")}</Label>
          <Input
            id="candle-symbol"
            value={symbol}
            disabled={busy}
            placeholder={t("Exact symbol used in your file")}
            onChange={(event) => {
              change();
              setSymbol(event.target.value.trim());
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="candle-resolution">{t("Candle resolution")}</Label>
          <OptionSelect
            id="candle-resolution"
            value={resolution}
            disabled={busy}
            onValueChange={(value) => {
              change();
              setResolution(value as Resolution);
            }}
          >
            <option value="" disabled>
              {t("Choose the file’s resolution")}
            </option>
            {Object.keys(RESOLUTIONS).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </OptionSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="candle-currency">{t("Quote currency")}</Label>
          <Input
            id="candle-currency"
            value={currency}
            disabled={busy}
            maxLength={12}
            onChange={(event) => {
              change();
              setCurrency(event.target.value.toUpperCase());
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="candle-basis">{t("Price basis")}</Label>
          <OptionSelect
            id="candle-basis"
            value={priceBasis}
            disabled={busy}
            onValueChange={(value) => {
              change();
              setPriceBasis(value);
            }}
          >
            <option value="" disabled>
              {t("Choose the file’s price basis")}
            </option>
            <option value="raw">{t("Unadjusted / raw")}</option>
            <option value="split">{t("Split adjusted")}</option>
            <option value="adjusted">{t("Other adjusted")}</option>
            <option value="midpoint">{t("Midpoint")}</option>
            <option value="bid">{t("Bid")}</option>
            <option value="ask">{tx("price", "Ask")}</option>
          </OptionSelect>
        </div>
      </div>
      <Button
        variant="outline"
        disabled={busy || !file || !symbol || !currency || !resolution || !priceBasis}
        onClick={() => void act("preview")}
      >
        {t("Validate & preview candles")}
      </Button>
      {preview && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs">
            {t("{count} candles · {from} to {to}", {
              count: preview.count.toLocaleString(),
              from: preview.from,
              to: preview.to,
            })}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="text-left">{t("First candles (UTC)")}</caption>
              <thead>
                <tr>
                  {["Time", "Open", "High", "Low", "Close"].map((label) => (
                    <th key={label} className="p-2">
                      {tx("candle", label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((bar) => (
                  <tr key={bar.time}>
                    <td className="p-2">{new Date(bar.time).toISOString()}</td>
                    {[bar.open, bar.high, bar.low, bar.close].map((value, index) => (
                      <td key={index} className="p-2">
                        <MonetaryValue>{value}</MonetaryValue>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button disabled={busy} onClick={() => void act("import")}>
            {t("Import market candles")}
          </Button>
        </div>
      )}
      {(error || listError) && (
        <p role="alert" className="text-xs text-destructive">
          {error || listError}
        </p>
      )}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {data?.datasets.map((dataset) => (
        <div
          key={dataset.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
        >
          <div className="min-w-0 text-xs">
            <p className="break-all font-medium">
              {dataset.name} · {dataset.symbol} · {dataset.resolution}
            </p>
            <p className="text-muted-foreground">
              {t("{count} candles", { count: dataset.count.toLocaleString() })} · {dataset.currency}{" "}
              · {dataset.priceBasis} · {dataset.from.slice(0, 10)} – {dataset.to.slice(0, 10)}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  t("Remove {name} and the MAE/MFE estimates saved from it?", {
                    name: dataset.name,
                  }),
                )
              )
                void act("remove", dataset.id);
            }}
          >
            {t("Remove dataset")}
          </Button>
        </div>
      ))}
    </div>
  );
}
