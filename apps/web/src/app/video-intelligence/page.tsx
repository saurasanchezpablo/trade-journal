"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Pause, Play, RefreshCw, RotateCcw, Square } from "lucide-react";
import type { ClaimRow, IntelligenceReport } from "@/lib/video-intelligence";
import { STATUS_LABELS, CLAIM_STATUSES_LIST } from "@/lib/video-intelligence";
import { postJson, useApi } from "@/lib/use-api";
import { fmtPercent } from "@/lib/utils";
import { FilterBar } from "@/components/filter-bar";
import { useI18n } from "@/components/i18n";
import {
  PredictionTable,
  Stat,
  StatusBadge,
  TradeTable,
  signedPercent,
} from "@/components/video-intelligence/parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Settings {
  enabled: boolean;
  paused: boolean;
  commissionBps: number;
  slippageBps: number;
  targetBufferBps: number;
}
interface Job {
  videoId: string;
  state: "queued" | "running" | "done" | "failed" | "unavailable";
  detail: string;
  attempts: number;
  nextAttemptAt: string | null;
  claims: number;
  source: "transcript" | "summary" | null;
  inputTokens: number;
  outputTokens: number;
  videoTitle: string;
  channelTitle: string;
  publishedAt: string;
  updatedAt: string;
}
interface Payload {
  settings: Settings;
  busy: boolean;
  report: IntelligenceReport;
  claims: ClaimRow[];
  jobs: Job[];
}

export default function VideoIntelligencePage() {
  return (
    <Suspense>
      <VideoIntelligence />
    </Suspense>
  );
}

function VideoIntelligence() {
  const { t } = useI18n();
  const [filters, setFilters] = useState({
    channel: "",
    instrument: "",
    direction: "",
    status: "",
    explicit: false,
    from: "",
    to: "",
  });
  const query = useMemo(() => {
    const p = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
      if (value) p.set(key, value === true ? "1" : String(value));
    return p.toString();
  }, [filters]);
  const { data, error, refresh } = useApi<Payload>(
    `/api/video-intelligence${query ? `?${query}` : ""}`,
  );
  const running = data ? data.report.processing.queued + data.report.processing.running > 0 : false;
  // Follow processing while it runs.
  useEffect(() => {
    if (!running || data?.settings.paused) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [running, data?.settings.paused, refresh]);

  const set = (patch: Partial<typeof filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div>
      <FilterBar title="Video intelligence" />
      <div className="space-y-4 p-4">
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t(
            "What the analysts you follow claimed in their videos, checked against what the market did afterwards. Predictions and simulated trades are kept apart: a right direction is not a profitable trade.",
          )}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Filters filters={filters} set={set} channels={data?.report.channels ?? []} />
        {!data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">{t("Overview")}</TabsTrigger>
              <TabsTrigger value="claims">{t("Claims")}</TabsTrigger>
              <TabsTrigger value="analysts">{t("Analysts")}</TabsTrigger>
              <TabsTrigger value="strategies">{t("Strategies")}</TabsTrigger>
              <TabsTrigger value="processing">{t("Processing")}</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <Overview report={data.report} settings={data.settings} />
            </TabsContent>
            <TabsContent value="claims" className="mt-4">
              <Claims claims={data.claims} />
            </TabsContent>
            <TabsContent value="analysts" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("Predictions by analyst")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <PredictionTable groups={data.report.analysts} label={t("Analyst")} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t("Predictions by instrument")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <PredictionTable groups={data.report.instruments} label={t("Instrument")} />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="strategies" className="mt-4 space-y-4">
              <Strategies report={data.report} settings={data.settings} onSaved={refresh} />
            </TabsContent>
            <TabsContent value="processing" className="mt-4">
              <Processing payload={data} refresh={refresh} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function Filters({
  filters,
  set,
  channels,
}: {
  filters: {
    channel: string;
    instrument: string;
    direction: string;
    status: string;
    explicit: boolean;
    from: string;
    to: string;
  };
  set: (patch: Partial<typeof filters>) => void;
  channels: { id: string; title: string }[];
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="vi-channel" className="text-xs">
          {t("Analyst")}
        </Label>
        <OptionSelect
          id="vi-channel"
          value={filters.channel}
          onValueChange={(channel) => set({ channel })}
        >
          <option value="">{t("All analysts")}</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </OptionSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="vi-instrument" className="text-xs">
          {t("Instrument")}
        </Label>
        <Input
          id="vi-instrument"
          className="w-32"
          value={filters.instrument}
          placeholder="BTCUSDT"
          maxLength={40}
          onChange={(e) => set({ instrument: e.target.value.trim() })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="vi-direction" className="text-xs">
          {t("Direction")}
        </Label>
        <OptionSelect
          id="vi-direction"
          value={filters.direction}
          onValueChange={(direction) => set({ direction })}
        >
          <option value="">{t("Any")}</option>
          <option value="long">{t("Bullish")}</option>
          <option value="short">{t("Bearish")}</option>
          <option value="neutral">{t("Neutral")}</option>
        </OptionSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="vi-status" className="text-xs">
          {t("Outcome")}
        </Label>
        <OptionSelect
          id="vi-status"
          value={filters.status}
          onValueChange={(status) => set({ status })}
        >
          <option value="">{t("Any")}</option>
          {CLAIM_STATUSES_LIST.map((s) => (
            <option key={s} value={s}>
              {t(STATUS_LABELS[s])}
            </option>
          ))}
        </OptionSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="vi-from" className="text-xs">
          {t("From")}
        </Label>
        <Input
          id="vi-from"
          type="date"
          value={filters.from}
          onChange={(e) => set({ from: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="vi-to" className="text-xs">
          {t("To")}
        </Label>
        <Input
          id="vi-to"
          type="date"
          value={filters.to}
          onChange={(e) => set({ to: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <Checkbox
          checked={filters.explicit}
          onCheckedChange={(v) => set({ explicit: v === true })}
        />
        {t("Only what the analyst said")}
      </label>
    </div>
  );
}

function Overview({ report, settings }: { report: IntelligenceReport; settings: Settings }) {
  const { t, tn } = useI18n();
  const o = report.overview;
  const p = report.processing;
  return (
    <div className="space-y-4">
      {!settings.enabled && (
        <Card>
          <CardContent className="pt-6 text-sm">
            {t(
              "Nothing has been processed yet. Start it in Processing: every stored video is read once (with your AI provider, for those with a transcript) and its claims are checked against market data from your enabled sources.",
            )}
          </CardContent>
        </Card>
      )}
      <section aria-label={t("Library")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("Videos processed")}
          value={`${p.done} / ${p.readable}`}
          hint={tn(p.videos, "{count} stored video", "{count} stored videos")}
        />
        <Stat label={t("Pending or failed")} value={`${p.queued + p.running} / ${p.failed}`} />
        <Stat
          label={t("Claims")}
          value={o.tally.claims}
          hint={t("{settled} settled · {pending} pending · {unevaluable} unevaluable", {
            settled: o.tally.resolved,
            pending: o.tally.pending,
            unevaluable: o.tally.unevaluable,
          })}
        />
        <Stat
          label={t("Strategy levels")}
          value={`A ${report.levels.A} · B ${report.levels.B} · C ${report.levels.C}`}
          hint={t("Only level C setups are simulated as trades.")}
        />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("Predictions")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Stat
              label={t("Target hit rate")}
              value={fmtPercent(o.tally.targetHitRate, 0)}
              hint={
                o.tally.targetHitInterval
                  ? t("95% interval {low} to {high}, n={n}", {
                      low: fmtPercent(o.tally.targetHitInterval.low, 0),
                      high: fmtPercent(o.tally.targetHitInterval.high, 0),
                      n: o.tally.resolved,
                    })
                  : t("No settled claims yet")
              }
            />
            <Stat
              label={t("Direction right at horizon")}
              value={fmtPercent(o.tally.directionRate, 0)}
              hint={t("n={n}", { n: o.tally.directional })}
            />
            <Stat label={t("Target hit after the horizon")} value={o.tally.late} />
            <Stat
              label={t("Stated probabilities (Brier)")}
              value={o.brier === null ? "–" : o.brier.toFixed(3)}
              hint={t(
                "{n} claims with a probability the analyst stated; 0 is perfect, 0.25 is a coin flip",
                { n: o.brierCount },
              )}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("Simulated trades (level C)")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Stat
              label={t("Trades")}
              value={o.trades.trades}
              hint={o.trades.insufficient ? t("Small sample") : undefined}
            />
            <Stat label={t("Expectancy (net)")} value={signedPercent(o.trades.expectancy)} />
            <Stat label={t("Win rate")} value={fmtPercent(o.trades.winRate, 0)} />
            <Stat
              label={t("Net total")}
              value={signedPercent(o.trades.netTotal)}
              hint={t("Gross {gross}", { gross: signedPercent(o.trades.grossTotal) })}
            />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("Data quality")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            {t(
              "Quotes found word for word in the transcript: {verified}; approximately: {approximate}; not found: {notFound}; from summaries (no quote): {none}.",
              report.evidence,
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "Claims count from the video's publication. A claim with no stated horizon uses the system's default for its timeframe (labelled on the claim). Rates under 20 settled claims are shown with a small-sample warning and should not be compared.",
            )}
          </p>
        </CardContent>
      </Card>
      {[
        { title: t("By direction"), groups: report.directions, label: t("Direction") },
        { title: t("By kind of claim"), groups: report.kinds, label: t("Kind") },
        { title: t("By market regime at the claim"), groups: report.regimes, label: t("Regime") },
        { title: t("By origin"), groups: report.origins, label: t("Origin") },
      ].map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <PredictionTable
              groups={section.groups.map((g) => ({ ...g, label: t(g.label) }))}
              label={section.label}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Claims({ claims }: { claims: ClaimRow[] }) {
  const { t } = useI18n();
  if (!claims.length)
    return <p className="text-sm text-muted-foreground">{t("No claims match these filters.")}</p>;
  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Published")}</TableHead>
              <TableHead>{t("Analyst")}</TableHead>
              <TableHead>{t("Claim")}</TableHead>
              <TableHead>{t("Instrument")}</TableHead>
              <TableHead>{t("Level")}</TableHead>
              <TableHead>{t("Outcome")}</TableHead>
              <TableHead className="text-right">{t("Trade (net)")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="tnum whitespace-nowrap">
                  {c.publishedAt.slice(0, 10)}
                </TableCell>
                <TableCell className="max-w-40 truncate">{c.channelTitle}</TableCell>
                <TableCell className="min-w-64">
                  <Link
                    href={`/video-intelligence/${c.videoId}#claim-${c.id}`}
                    className="hover:underline"
                  >
                    {c.statement}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline">{t(c.kind)}</Badge>
                    <Badge variant="outline">{t(c.origin)}</Badge>
                    {c.horizonSource === "convention" && (
                      <Badge variant="outline">{t("system horizon")}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{c.instrument}</TableCell>
                <TableCell>{c.level}</TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                  {c.reason && (
                    <div className="mt-1 max-w-56 text-xs text-muted-foreground">{t(c.reason)}</div>
                  )}
                </TableCell>
                <TableCell className="tnum text-right">
                  {signedPercent(c.netReturn)}
                  {c.r !== null && (
                    <div className="text-xs text-muted-foreground">{`${c.r > 0 ? "+" : ""}${c.r.toFixed(2)}R`}</div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Strategies({
  report,
  settings,
  onSaved,
}: {
  report: IntelligenceReport;
  settings: Settings;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [costs, setCosts] = useState({
    commissionBps: String(settings.commissionBps),
    slippageBps: String(settings.slippageBps),
    targetBufferBps: String(settings.targetBufferBps),
  });
  const [message, setMessage] = useState("");
  const save = async () => {
    setMessage("");
    try {
      const body = Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, Number(v)]));
      await postJson("/api/video-intelligence", body, "PUT");
      setMessage(t("Saved. The setups are simulated again in the background."));
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Save failed"));
    }
  };
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("Simulated trades by analyst")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TradeTable groups={report.analysts} label={t("Analyst")} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("Simulated trades by instrument")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TradeTable groups={report.instruments} label={t("Instrument")} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("Simulated trades by market regime")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TradeTable
            groups={report.regimes.map((g) => ({ ...g, label: t(g.label) }))}
            label={t("Regime")}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("Execution assumptions")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              {t(
                "A setup is traded once: a limit entry at the near edge of the stated zone (at the open when a candle opens past it), between the video's publication and the horizon's end.",
              )}
            </li>
            <li>
              {t(
                "Exit at the stop, at the nearest target once price trades beyond it by the buffer, or at the close of the last candle inside the horizon. A gap past the stop exits at the open.",
              )}
            </li>
            <li>
              {t(
                "A stop and a target inside one candle count as the stop, and the trade is flagged ambiguous. The entry candle can stop a trade out but not take its target.",
              )}
            </li>
            <li>
              {t(
                "Returns are per trade, as a share of the entry, summed one after another (no compounding, no position sizing).",
              )}
            </li>
          </ul>
          <div className="flex flex-wrap items-end gap-3">
            {(
              [
                ["commissionBps", t("Commission per side (bps)")],
                ["slippageBps", t("Slippage per fill (bps)")],
                ["targetBufferBps", t("Target buffer (bps)")],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`vi-${key}`} className="text-xs">
                  {label}
                </Label>
                <Input
                  id={`vi-${key}`}
                  type="number"
                  min={0}
                  max={500}
                  step="0.5"
                  className="w-28"
                  value={costs[key]}
                  onChange={(e) => setCosts((c) => ({ ...c, [key]: e.target.value }))}
                />
              </div>
            ))}
            <Button onClick={() => void save()}>{t("Save")}</Button>
          </div>
          {message && <p role="status">{message}</p>}
        </CardContent>
      </Card>
    </>
  );
}

const JOB_STATES: Record<Job["state"], string> = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  unavailable: "Nothing to read",
};

function Processing({ payload, refresh }: { payload: Payload; refresh: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const p = payload.report.processing;
  const act = async (action: string, videoId?: string) => {
    setBusy(true);
    setMessage("");
    try {
      await postJson("/api/video-intelligence/actions", {
        action,
        ...(videoId ? { videoId } : {}),
      });
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Action failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("Processing")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat
              label={t("Stored videos")}
              value={p.videos}
              hint={t("{n} with a transcript or summary", { n: p.readable })}
            />
            <Stat label={t("Done")} value={p.done} />
            <Stat label={t("Queued")} value={p.queued + p.running} />
            <Stat label={t("Failed")} value={p.failed} />
            <Stat label={t("Nothing to read")} value={p.unavailable} />
            <Stat
              label={t("AI tokens used")}
              value={
                p.inputTokens + p.outputTokens < 1000
                  ? String(p.inputTokens + p.outputTokens)
                  : `${Math.round((p.inputTokens + p.outputTokens) / 1000)}k`
              }
              hint={t("{input} in · {output} out", {
                input: p.inputTokens,
                output: p.outputTokens,
              })}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {payload.settings.paused
              ? t(
                  "Paused: the video under way finishes its step, then nothing more runs until you resume.",
                )
              : payload.settings.enabled
                ? t(
                    "Running in the background: new videos are read as their summaries arrive, and pending claims are evaluated again every six hours.",
                  )
                : t(
                    "Not started. Videos with a transcript are read by your AI provider (it uses tokens); videos without one are taken from their summary.",
                  )}
          </p>
          <div className="flex flex-wrap gap-2">
            {!payload.settings.enabled || p.notQueued > 0 ? (
              <Button disabled={busy} onClick={() => void act("start")}>
                <Play />{" "}
                {payload.settings.enabled
                  ? t("Queue new videos ({n})", { n: p.notQueued })
                  : t("Start: read every video")}
              </Button>
            ) : null}
            {payload.settings.enabled &&
              (payload.settings.paused ? (
                <Button variant="outline" disabled={busy} onClick={() => void act("resume")}>
                  <Play /> {t("Resume")}
                </Button>
              ) : (
                <Button variant="outline" disabled={busy} onClick={() => void act("pause")}>
                  <Pause /> {t("Pause")}
                </Button>
              ))}
            <Button
              variant="outline"
              disabled={busy || p.queued === 0}
              onClick={() => void act("cancel")}
            >
              <Square /> {t("Cancel queued")}
            </Button>
            <Button
              variant="outline"
              disabled={busy || p.failed + p.unavailable === 0}
              onClick={() => void act("retry")}
            >
              <RotateCcw /> {t("Retry failed")}
            </Button>
            <Button
              variant="outline"
              disabled={busy || payload.busy}
              onClick={() => void act("reevaluate")}
            >
              <RefreshCw /> {t("Evaluate pending claims now")}
            </Button>
          </div>
          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("Videos")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!payload.jobs.length ? (
            <p className="text-sm text-muted-foreground">{t("No video has been queued yet.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Published")}</TableHead>
                  <TableHead>{t("Video")}</TableHead>
                  <TableHead>{t("State")}</TableHead>
                  <TableHead className="text-right">{t("Claims")}</TableHead>
                  <TableHead>{t("Read from")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payload.jobs.map((job) => (
                  <TableRow key={job.videoId}>
                    <TableCell className="tnum whitespace-nowrap">
                      {job.publishedAt.slice(0, 10)}
                    </TableCell>
                    <TableCell className="min-w-64">
                      <Link href={`/video-intelligence/${job.videoId}`} className="hover:underline">
                        {job.videoTitle}
                      </Link>
                      <div className="text-xs text-muted-foreground">{job.channelTitle}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={job.state === "failed" ? "loss" : "outline"}>
                        {t(JOB_STATES[job.state]).toUpperCase()}
                      </Badge>
                      {job.detail && (
                        <div className="mt-1 max-w-72 text-xs text-muted-foreground">
                          {t(job.detail)}
                        </div>
                      )}
                      {job.state === "failed" && job.nextAttemptAt && (
                        <div className="text-xs text-muted-foreground">
                          {t("Retried after {time}", {
                            time: new Date(job.nextAttemptAt).toLocaleString(),
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="tnum text-right">{job.claims}</TableCell>
                    <TableCell>
                      {job.source ? t(job.source === "transcript" ? "Transcript" : "Summary") : "–"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || job.state === "running"}
                        onClick={() => void act("reprocess", job.videoId)}
                      >
                        {t("Read again")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
