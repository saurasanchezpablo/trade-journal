"use client";

import { useState } from "react";
import { ImageUp, Sparkles } from "lucide-react";
import { fmtPrice } from "@/lib/analysis-text";
import { tr } from "@/lib/i18n";
import { postJson } from "@/lib/use-api";
import { Button } from "./ui/button";
import { AiNotice } from "./ai-notice";
import { useI18n } from "./i18n";

interface ReadLevel {
  kind: "line" | "zone";
  low: number;
  high: number;
  label: string;
  role: "support" | "resistance" | null;
  confidence: "high" | "medium" | "low";
  doubt: string | null;
}

const MAX_BYTES = 4 * 1024 * 1024;

/** The picture as a data URL, scaled down to JPEG when it is too large to send. */
async function asDataUrl(file: Blob): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(tr("Could not read the picture.")));
    reader.readAsDataURL(file);
  });
  if (file.size <= MAX_BYTES * 0.7 && /^data:image\/(png|jpeg|webp);/.test(url)) return url;
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error(tr("That file is not a picture the browser can open.")));
    image.src = url;
  });
  const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * Levels from a screenshot: give it a picture of a chart (yours, a service's or a friend's),
 * the AI reads its horizontal levels and zones, and the ones you tick are drawn here.
 */
export function ScreenshotLevels({
  symbol,
  lastPrice,
  disabled,
  onAdd,
}: {
  symbol: string;
  lastPrice: () => number | null;
  disabled?: boolean;
  onAdd: (lines: { price: number; label: string }[], zones: ReadLevel[]) => void;
}) {
  const { t, tx } = useI18n();
  const [picture, setPicture] = useState<string | null>(null);
  const [levels, setLevels] = useState<ReadLevel[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (file: Blob | null | undefined) => {
    if (!file) return;
    setError(null);
    setLevels(null);
    try {
      setPicture(await asDataUrl(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not read the picture."));
    }
  };
  const readLevels = async () => {
    if (!picture) return;
    setBusy(true);
    setError(null);
    try {
      const price = lastPrice();
      const result = await postJson<{ symbolShown: string | null; levels: ReadLevel[] }>(
        "/api/ai/chart-levels",
        { image: picture, symbol, ...(price ? { lastPrice: price } : {}) },
      );
      setLevels(result.levels);
      setShown(result.symbolShown);
      // Ticked by default: what the AI is sure of and nothing doubtful.
      setChosen(
        new Set(
          result.levels
            .map((l, i) => (l.confidence !== "low" && !l.doubt ? i : -1))
            .filter((i) => i >= 0),
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not read levels"));
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    const picked = (levels ?? []).filter((_, i) => chosen.has(i));
    onAdd(
      picked.filter((l) => l.kind === "line").map((l) => ({ price: l.low, label: l.label })),
      picked.filter((l) => l.kind === "zone"),
    );
    setLevels(null);
    setPicture(null);
  };
  const mismatch =
    shown &&
    symbol &&
    !shown
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .includes(
        symbol
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 3),
      );

  return (
    <div
      className="space-y-2"
      onPaste={(e) =>
        void load(Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/")))
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs hover:bg-accent">
          <ImageUp className="size-3.5" aria-hidden />
          {t("Levels from a screenshot")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => void load(e.target.files?.[0])}
          />
        </label>
        {picture && (
          <Button
            type="button"
            size="sm"
            disabled={busy || disabled}
            onClick={() => void readLevels()}
          >
            <Sparkles />
            {busy ? t("Reading…") : t("Read the levels")}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("Choose or paste a chart picture; it is sent to your AI provider to read its levels.")}
      </p>
      {picture && !levels && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={picture}
          alt={t("Screenshot to read")}
          className="max-h-40 rounded border object-contain"
        />
      )}
      {error && (
        <AiNotice
          error={error}
          onRetry={() => void readLevels()}
          onDismiss={() => setError(null)}
        />
      )}
      {levels && (
        <div
          className="space-y-1.5 rounded-md border border-dashed p-2 text-xs"
          aria-label={t("Levels read")}
        >
          {mismatch && (
            <p className="text-muted-foreground">
              {t("The picture shows {shown}, not {symbol}: check the prices fit this chart.", {
                shown,
                symbol,
              })}
            </p>
          )}
          {levels.length === 0 && <p>{t("No horizontal levels found in the picture.")}</p>}
          {levels.map((l, i) => (
            <label key={i} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={chosen.has(i)}
                onChange={(e) =>
                  setChosen((set) => {
                    const next = new Set(set);
                    if (e.target.checked) next.add(i);
                    else next.delete(i);
                    return next;
                  })
                }
              />
              <span>
                <span className="tnum font-medium">
                  {l.kind === "line"
                    ? fmtPrice(l.low)
                    : t("{low} to {high}", { low: fmtPrice(l.low), high: fmtPrice(l.high) })}
                </span>{" "}
                {l.kind === "zone" ? tx("level", "zone") : tx("level", "line")}
                {l.label ? `, ${l.label}` : ""}
                <span className="text-muted-foreground">
                  {" "}
                  · {t(`${l.confidence} confidence`)}
                  {l.doubt ? ` · ${l.doubt}` : ""}
                </span>
              </span>
            </label>
          ))}
          {levels.length > 0 && (
            <Button type="button" size="sm" variant="outline" disabled={!chosen.size} onClick={add}>
              {t("Add {count} to the chart", { count: chosen.size })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
