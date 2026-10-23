"use client";

import { BetaGate } from "@/components/beta";
import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeft, ExternalLink, RotateCcw } from "lucide-react";
import type { ClaimBar, TraceStep } from "@luxalgo/journal-core";
import type { VideoClaim } from "@/lib/video-claims";
import { postJson, useApi } from "@/lib/use-api";
import { fmtDuration, fmtPercent } from "@/lib/utils";
import { FilterBar } from "@/components/filter-bar";
import { useI18n } from "@/components/i18n";
import { ClaimChart } from "@/components/video-intelligence/claim-chart";
import { StatusBadge, signedPercent } from "@/components/video-intelligence/parts";
import { STATUS_LABELS } from "@/lib/video-intelligence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StoredClaim, StoredEvaluation } from "@/server/video-intelligence/store";

interface Payload {
  video: {
    videoId: string;
    title: string;
    url: string;
    channelTitle: string;
    publishedAt: string;
    lengthSeconds: number | null;
    source: string | null;
  };
  job: {
    state: string;
    detail: string;
    extractorVersion: string | null;
    evaluatorVersion: string | null;
    source: string | null;
  } | null;
  transcript: string | null;
  claims: (StoredClaim & { evaluation: StoredEvaluation | null; trace: TraceStep[] })[];
  candles: Record<string, ClaimBar[]>;
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export default function VideoDetailPage({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = use(params);
  return (
    <BetaGate feature="videoIntelligence">
      <VideoDetail videoId={videoId} />
    </BetaGate>
  );
}

function VideoDetail({ videoId }: { videoId: string }) {
  const { t } = useI18n();
  const { data, error, refresh } = useApi<Payload>(
    `/api/video-intelligence/videos/${encodeURIComponent(videoId)}`,
  );
  const [message, setMessage] = useState("");
  const reprocess = async () => {
    setMessage("");
    try {
      await postJson("/api/video-intelligence/actions", { action: "reprocess", videoId });
      setMessage(t("Queued to be read again."));
      refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t("Action failed"));
    }
  };
  return (
    <div>
      <FilterBar title="Video intelligence" />
      <div className="space-y-4 p-4">
        <Link
          href="/video-intelligence"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-4" /> {t("All videos")}
        </Link>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg normal-case tracking-normal">
                  {data.video.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  {data.video.channelTitle} ·{" "}
                  {t("published {time} UTC", {
                    time: data.video.publishedAt.slice(0, 16).replace("T", " "),
                  })}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={data.video.url} target="_blank" rel="noreferrer noopener">
                      <ExternalLink /> {t("Watch on YouTube")}
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void reprocess()}>
                    <RotateCcw /> {t("Read again")}
                  </Button>
                  {data.job && <Badge variant="outline">{t(data.job.state).toUpperCase()}</Badge>}
                </div>
                {data.job?.detail && (
                  <p className="text-xs text-muted-foreground">{t(data.job.detail)}</p>
                )}
                {message && <p role="status">{message}</p>}
                {data.job && (
                  <p className="text-xs text-muted-foreground">
                    {t("Read from: {source} · extractor {extractor} · evaluator {evaluator}", {
                      source: data.job.source
                        ? t(data.job.source === "transcript" ? "Transcript" : "Summary")
                        : "–",
                      extractor: data.job.extractorVersion ?? "–",
                      evaluator: data.job.evaluatorVersion ?? "–",
                    })}
                  </p>
                )}
              </CardContent>
            </Card>
            {!data.claims.length ? (
              <p className="text-sm text-muted-foreground">
                {data.job
                  ? t("No checkable claims were found in this video.")
                  : t("This video has not been processed yet.")}
              </p>
            ) : (
              data.claims.map((claim) => (
                <ClaimCard
                  key={claim.id}
                  claim={claim}
                  candles={data.candles}
                  url={data.video.url}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}

const levels = (values: number[]) => (values.length ? values.join(", ") : "–");

function ClaimCard({
  claim,
  candles,
  url,
}: {
  claim: StoredClaim & { evaluation: StoredEvaluation | null; trace: TraceStep[] };
  candles: Record<string, ClaimBar[]>;
  url: string;
}) {
  const { t, tx } = useI18n();
  const c: VideoClaim = claim.claim;
  const e = claim.evaluation;
  const o = e?.outcome ?? null;
  const sim = e?.simulation ?? null;
  const bars = e?.market ? (candles[e.market.series] ?? []) : [];
  const horizon =
    c.horizonValue !== null
      ? t("{value} {unit} (stated)", { value: c.horizonValue, unit: t(c.horizonUnit ?? "days") })
      : t("to {date} (system default for its timeframe)", { date: claim.horizonEnd.slice(0, 10) });
  return (
    <Card id={`claim-${claim.id}`} className="scroll-mt-20">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={e?.status ?? "not_evaluated"} />
          <Badge variant="outline">{t(c.kind)}</Badge>
          <Badge variant="outline">{t(c.origin)}</Badge>
          <Badge variant="outline">{t("Level {level}", { level: claim.level })}</Badge>
          <Badge variant="outline">
            {t(
              claim.evidence === "verified"
                ? "Quote verified"
                : claim.evidence === "approximate"
                  ? "Quote approximately found"
                  : claim.evidence === "not_found"
                    ? "Quote not found in transcript"
                    : "No quote",
            )}
          </Badge>
        </div>
        <CardTitle className="text-base normal-case tracking-normal">{c.statement}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {c.quote && (
          <blockquote className="border-l-2 pl-3 italic text-muted-foreground">
            “{c.quote}”
            {claim.quoteAt !== null && (
              <a
                className="ml-2 not-italic underline"
                href={`${url}&t=${claim.quoteAt}s`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {clock(claim.quoteAt)}
              </a>
            )}
          </blockquote>
        )}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
            {t("What was claimed")}
          </h3>
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field
              label={t("Instrument")}
              value={`${c.instrument}${c.ticker ? ` (${c.ticker})` : ""}`}
            />
            <Field
              label={t("Direction")}
              value={t(
                c.direction === "long"
                  ? "Bullish"
                  : c.direction === "short"
                    ? "Bearish"
                    : "Neutral",
              )}
            />
            <Field label={t("Timeframe")} value={c.timeframe ?? "–"} />
            <Field label={t("Horizon")} value={horizon} />
            <Field label={t("Quoted price")} value={c.referencePrice ?? "–"} />
            <Field
              label={t("Probability stated")}
              value={c.probability === null ? "–" : fmtPercent(c.probability, 0)}
            />
            <Field label={t("Targets")} value={levels(c.targets)} />
            <Field
              label={t("Invalidation")}
              value={
                c.invalidation === null
                  ? "–"
                  : `${c.invalidation}${c.invalidationOn === "close" ? ` (${t("on a close")})` : ""}`
              }
            />
            <Field
              label={t("Trigger")}
              value={
                c.triggerPrice === null
                  ? (c.condition ?? "–")
                  : `${t(c.triggerKind === "below" ? "below" : "above")} ${c.triggerPrice}`
              }
            />
            <Field
              label={t("Entry")}
              value={
                c.entryLow === null
                  ? "–"
                  : c.entryLow === c.entryHigh
                    ? c.entryLow
                    : `${c.entryLow} – ${c.entryHigh}`
              }
            />
            <Field label={tx("chart level", "Stop")} value={c.stop ?? "–"} />
            <Field label={t("Extraction confidence")} value={fmtPercent(c.confidence, 0)} />
          </dl>
          {c.unclear.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
              {c.unclear.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          )}
        </section>
        {o && (
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              {t("What happened")}
            </h3>
            {o.reason ? (
              <p>{t(o.reason)}</p>
            ) : (
              <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Field label={t("Reference price (market)")} value={o.referencePrice ?? "–"} />
                <Field
                  label={t("Evaluated as")}
                  value={o.side ? t(o.side === "long" ? "Bullish" : "Bearish") : "–"}
                />
                <Field label={t("Time to target")} value={fmtDuration(o.timeToTarget)} />
                <Field
                  label={t("Time to invalidation")}
                  value={fmtDuration(o.timeToInvalidation)}
                />
                <Field label={t("Best move (MFE)")} value={signedPercent(o.mfe)} />
                <Field label={t("Worst move (MAE)")} value={signedPercent(o.mae)} />
                <Field
                  label={t("Direction at horizon")}
                  value={
                    o.directional
                      ? t(
                          o.directional === "correct"
                            ? "Right"
                            : o.directional === "incorrect"
                              ? "Wrong"
                              : "Flat",
                        )
                      : "–"
                  }
                />
                <Field label={t("Move at horizon")} value={signedPercent(o.horizonReturn)} />
                {o.triggeredAt !== null && (
                  <Field
                    label={t("Triggered")}
                    value={new Date(o.triggeredAt).toISOString().slice(0, 16).replace("T", " ")}
                  />
                )}
              </dl>
            )}
            {o.notes.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                {o.notes.map((n) => (
                  <li key={n}>{t(n)}</li>
                ))}
              </ul>
            )}
          </section>
        )}
        {claim.trace.length > 0 && <Trace steps={claim.trace} />}
        {e?.baseline && o && o.status !== "unevaluable" && (
          <p className="text-sm">
            <span className="font-medium">{t("Against chance:")}</span>{" "}
            {t(
              "the same distances bet the other way ({side}, target {target}) ended {status} on the same candles.",
              {
                side: t(e.baseline.side === "long" ? "Bullish" : "Bearish").toLowerCase(),
                target: e.baseline.target === null ? "–" : e.baseline.target.toFixed(2),
                status: t(STATUS_LABELS[e.baseline.status]).toLowerCase(),
              },
            )}
          </p>
        )}
        {bars.length > 0 && (
          <ClaimChart
            bars={bars}
            claimTime={Date.parse(claim.claimTime)}
            horizonEnd={Date.parse(claim.horizonEnd)}
            targets={c.targets}
            invalidation={c.invalidation}
            entry={
              claim.level === "C" ? (c.direction === "short" ? c.entryLow : c.entryHigh) : null
            }
            stop={claim.level === "C" ? c.stop : null}
            outcome={o}
          />
        )}
        {sim && (
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              {t("Simulated trade (hypothetical)")}
            </h3>
            {!sim.trade ? (
              <p>{t((sim as { reason?: string }).reason ?? "")}</p>
            ) : (
              <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Field
                  label={t("Entry")}
                  value={`${sim.trade.entryPrice.toFixed(4)} · ${new Date(sim.trade.entryTime).toISOString().slice(0, 16).replace("T", " ")}`}
                />
                <Field
                  label={t("Exit")}
                  value={
                    sim.trade.exitPrice === null
                      ? t("Still open")
                      : `${sim.trade.exitPrice.toFixed(4)} (${t(sim.trade.exit)})`
                  }
                />
                <Field label={t("Gross")} value={signedPercent(sim.trade.grossReturn)} />
                <Field label={t("Net")} value={signedPercent(sim.trade.netReturn)} />
                <Field
                  label={t("Result in R")}
                  value={
                    sim.trade.r === null
                      ? "–"
                      : `${sim.trade.r > 0 ? "+" : ""}${sim.trade.r.toFixed(2)}R`
                  }
                />
                <Field
                  label={t("No cost / 2× cost")}
                  value={`${signedPercent(sim.sensitivity?.free ?? null)} / ${signedPercent(sim.sensitivity?.double ?? null)}`}
                />
              </dl>
            )}
            {sim.trade?.ambiguous && (
              <p className="mt-1 text-xs">
                {t("A stop and a target fell inside one candle: counted as the stop.")}
              </p>
            )}
            <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
              {sim.notes.map((n) => (
                <li key={n}>{t(n)}</li>
              ))}
              {sim.costs && (
                <li>
                  {t(
                    "Costs: {commission} bps commission per side, {slippage} bps slippage per fill, target buffer {buffer} bps.",
                    {
                      commission: sim.costs.commissionBps,
                      slippage: sim.costs.slippageBps,
                      buffer: sim.costs.targetBufferBps,
                    },
                  )}
                </li>
              )}
            </ul>
          </section>
        )}
        {e && (
          <p className="text-xs text-muted-foreground">
            {e.market
              ? t(
                  "Market data: {provider} {symbol}, {resolution} candles ({bars}), read {time}. Evaluator {version}.",
                  {
                    provider: e.market.providerName,
                    symbol: e.market.symbol,
                    resolution: e.market.resolution,
                    bars: e.market.bars,
                    time: e.market.retrievedAt.slice(0, 16).replace("T", " "),
                    version: e.evaluatorVersion,
                  },
                )
              : t("No market data. Evaluator {version}.", { version: e.evaluatorVersion })}
            {e.regime &&
              e.regime.trend !== "unknown" &&
              ` ${t("Regime at the claim: {trend}, {volatility} volatility.", {
                trend: t(e.regime.trend === "up" ? "uptrend" : "downtrend"),
                volatility: t(e.regime.volatility),
              })}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const utc = (time: number) => `${new Date(time).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const px = (value: number) => String(Number(value.toPrecision(10)));

/** The candles that decided the outcome, each with the price that settled it. */
function Trace({ steps }: { steps: TraceStep[] }) {
  const { t, tx } = useI18n();
  const line = (step: TraceStep) => {
    const c = step.candle;
    switch (step.kind) {
      case "reference":
        return t(
          "Reference: the candle opening {time} closed at {price}, the last close before the video.",
          {
            time: utc(c.time),
            price: px(step.price),
          },
        );
      case "trigger":
        return t(
          "Trigger: the candle opening {time} traded {direction} {price} (high {high}, low {low}).",
          {
            time: utc(c.time),
            direction: t(step.above ? "above" : "below"),
            price: px(step.price),
            high: px(c.high),
            low: px(c.low),
          },
        );
      case "target":
        return t(
          "Target {price}: first reached by the candle opening {time} ({extreme} {value}).",
          {
            price: px(step.price),
            time: utc(c.time),
            extreme: tx("candle", step.side === "long" ? "high" : "low"),
            value: px(step.side === "long" ? c.high : c.low),
          },
        );
      case "invalidation":
        return step.onClose
          ? t("Invalidation {price}: the candle opening {time} closed beyond it, at {close}.", {
              price: px(step.price),
              time: utc(c.time),
              close: px(c.close),
            })
          : t(
              "Invalidation {price}: first reached by the candle opening {time} (high {high}, low {low}).",
              {
                price: px(step.price),
                time: utc(c.time),
                high: px(c.high),
                low: px(c.low),
              },
            );
      case "ambiguous":
        return t(
          "The candle opening {time} (high {high}, low {low}) reached both the target {target} and the invalidation {invalidation}: which came first is unknown.",
          {
            time: utc(c.time),
            high: px(c.high),
            low: px(c.low),
            target: px(step.target),
            invalidation: px(step.invalidation),
          },
        );
      case "horizon":
        return t(
          "Horizon end: the last candle inside it, opening {time}, closed at {close}: {move} from {reference}.",
          {
            time: utc(c.time),
            close: px(c.close),
            move: signedPercent(step.move),
            reference: px(step.reference),
          },
        );
    }
  };
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
        {t("How this was decided")}
      </h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {steps.map((step) => (
          <li key={`${step.kind}-${step.candle.time}`}>{line(step)}</li>
        ))}
      </ol>
    </section>
  );
}
