"use client";
import { AiRecap } from "@/components/ai-recap";
import { JournalChat } from "@/components/journal-chat";
import { VoiceMemo } from "@/components/voice-memo";
import { SimilarPast } from "@/components/note-search";
import { ExternalOpinions } from "@/components/external-opinions";
import { analysesUsedMarkdown } from "@/components/ai-charts-option";
import { DayAnalyses } from "@/components/day-analyses";
import { formatTimestamp } from "@/lib/timezone";
import { dayKeyOf } from "@luxalgo/journal-core";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CandlestickChart } from "lucide-react";
import { Suspense, use, useEffect, useRef, useState } from "react";
import type { IntradayPoint, TradeMetrics } from "@luxalgo/journal-core";
import { EquityArea } from "@/components/charts/equity-area";
import { FilterBar, useFilters } from "@/components/filter-bar";
import { Pnl } from "@/components/pnl";
import { MonetaryValue } from "@/components/privacy";
import { VoiceNote } from "@/components/voice-note";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RichEditor, type RichEditorHandle } from "@/components/rich-editor";
import { Attachments } from "@/components/attachments";
import { ReviewExport } from "@/components/review-export";
import { useAutosave } from "@/lib/use-autosave";
import { useApi } from "@/lib/use-api";
import { fmtMoney, fmtNumber, fmtPercent } from "@/lib/utils";
import { useI18n } from "@/components/i18n";

interface TradeRowLite {
  key: string;
  symbol: string;
  direction: string;
  status: string;
  netPnl: number;
  quantity: number;
  avgEntry: number;
  avgExit: number | null;
  fees: number;
}

interface DayPayload {
  date: string;
  metrics: TradeMetrics;
  trades: TradeRowLite[];
  intraday: IntradayPoint[];
  note: string;
}

export default function JournalDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params);
  return (
    <Suspense>
      <JournalDay key={date} date={date} />
    </Suspense>
  );
}

/** The note with a block added after it, or the block alone on an empty note. */
const appended = (separator: string, block: string) => (current: string) =>
  current ? `${current}${separator}${block}` : block;

/** A trade's status as its badge reads it (statuses are lowercase in the data). */
const STATUS_LABELS: Record<string, string> = {
  win: "Win",
  loss: "Loss",
  breakeven: "Breakeven",
  open: "Open",
};

function JournalDay({ date }: { date: string }) {
  const { t, tx } = useI18n();
  const { query, values: filters, timeZone } = useFilters();
  // A scheduled recap's notification links here with its chat.
  const chatId = useSearchParams()?.get("chat") ?? null;
  const { data, error } = useApi<DayPayload>(`/api/journal/${date}?${query}`);
  const [note, setNote] = useState<string | null>(null);
  const [lastRecap, setLastRecap] = useState<{ key: string; text: string } | null>(null);
  const noteEditor = useRef<RichEditorHandle>(null);
  const { save, status: saving, flush } = useAutosave(`/api/journal/${date}`, "PUT");
  const noteValue = note ?? data?.note ?? "";
  const latestNote = useRef(noteValue);
  latestNote.current = noteValue;
  const scheduleSave = (value: string) => {
    latestNote.current = value;
    setNote(value);
    save({ note: value });
  };
  // An addition made before the saved note has loaded would replace it: it waits for it.
  const loaded = note !== null || data !== null;
  const waiting = useRef<Array<(current: string) => string>>([]);
  const change = (build: (current: string) => string) => {
    if (loaded) scheduleSave(build(latestNote.current));
    else waiting.current.push(build);
  };
  useEffect(() => {
    if (!data || waiting.current.length === 0) return;
    const builds = waiting.current;
    waiting.current = [];
    scheduleSave(builds.reduce((text, build) => build(text), latestNote.current));
    // Once, when the day arrives (scheduleSave is recreated each render).
  }, [data]);

  const m = data?.metrics;
  return (
    <div>
      <FilterBar title={t("Journal · {date}", { date })} />
      <div className="grid gap-3 p-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-3 xl:col-span-2">
          {m && m.closedTrades > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("Day stats")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 2xl:grid-cols-5">
                <Stat label={t("Net P&L")}>
                  <Pnl value={m.netPnl} className="font-semibold" />
                </Stat>
                <Stat label={t("Trades")}>{m.closedTrades}</Stat>
                <Stat label={t("Winrate")}>{fmtPercent(m.winRate)}</Stat>
                <Stat label={t("Winners")}>{m.wins}</Stat>
                <Stat label={t("Losers")}>{m.losses}</Stat>
                <Stat label={t("Gross")}>
                  <MonetaryValue>{fmtMoney(m.grossPnl)}</MonetaryValue>
                </Stat>
                <Stat label={t("Fees")}>
                  <MonetaryValue>{fmtMoney(m.fees)}</MonetaryValue>
                </Stat>
                <Stat label={t("Volume")}>{fmtNumber(m.totalVolume, 0)}</Stat>
                <Stat label={t("Profit factor")}>
                  {m.profitFactorIsInfinite
                    ? "∞"
                    : m.profitFactor === null
                      ? "–"
                      : fmtNumber(m.profitFactor)}
                </Stat>
                <Stat label={t("Expectancy")}>
                  <MonetaryValue>
                    {m.expectancy === null ? "–" : fmtMoney(m.expectancy)}
                  </MonetaryValue>
                </Stat>
              </CardContent>
            </Card>
          ) : (
            m && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  {t("No closed trades this day.")}
                </CardContent>
              </Card>
            )
          )}

          {data && data.intraday.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("Intraday cumulative net P&L")}</CardTitle>
              </CardHeader>
              <CardContent>
                <EquityArea
                  data={data.intraday.map((p) => ({
                    t: formatTimestamp(p.t, timeZone).slice(11, 16),
                    cumNetPnl: p.cumNetPnl,
                  }))}
                  height={200}
                />
              </CardContent>
            </Card>
          )}

          {data && data.trades.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("Trades")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {data.trades.map((trade) => (
                  <Link
                    key={trade.key}
                    href={`/trades/${encodeURIComponent(trade.key)}?${query}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"
                  >
                    <span className="flex items-center gap-2">
                      <Badge
                        variant={
                          trade.status === "win"
                            ? "profit"
                            : trade.status === "loss"
                              ? "loss"
                              : "secondary"
                        }
                      >
                        {(STATUS_LABELS[trade.status]
                          ? tx("status", STATUS_LABELS[trade.status]!)
                          : trade.status
                        ).toUpperCase()}
                      </Badge>
                      <span className="font-medium">{trade.symbol}</span>
                      <span className="text-xs text-muted-foreground">
                        {tx("direction", trade.direction)}
                      </span>
                    </span>
                    <span className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
                      <span className="tnum text-xs text-muted-foreground">
                        {fmtNumber(trade.quantity, 4)} @{" "}
                        <MonetaryValue>{fmtNumber(trade.avgEntry)}</MonetaryValue>
                        {trade.avgExit !== null && (
                          <>
                            {" "}
                            → <MonetaryValue>{fmtNumber(trade.avgExit)}</MonetaryValue>
                          </>
                        )}
                      </span>
                      <Pnl value={trade.netPnl} />
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          {!data && <Skeleton className="h-64" />}
          <DayAnalyses
            date={date}
            today={date === dayKeyOf(new Date().toISOString(), timeZone)}
            note={noteValue}
            onInsert={(markdown) =>
              change((current) =>
                current.trim()
                  ? `${current.replace(/\s+$/, "")}\n\n${markdown}\n`
                  : `${markdown}\n`,
              )
            }
          />
        </div>

        <Card className="h-fit">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>{t("Day note")}</CardTitle>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/charts?day=${date}`}>
                  <CandlestickChart />
                  {t("Chart analysis")}
                </Link>
              </Button>
              <VoiceNote
                onPrepare={() => noteEditor.current?.focus()}
                onText={(text) =>
                  change((current) =>
                    current ? `${current}${current.endsWith(" ") ? "" : " "}${text}` : text,
                  )
                }
              />
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              {t(
                "This note is shared across accounts. AI recaps use the selected filters and append a labeled section. Shared notes are excluded from filtered AI context. This day's chart analyses are sent as they were that day.",
              )}
            </p>
            <div className="mb-3">
              <VoiceMemo kind="day" onInsert={(markdown) => change(appended("\n\n", markdown))} />
            </div>
            <div className="mb-3">
              <AiRecap
                key={`${date}:${timeZone}:${query}`}
                date={date}
                filters={filters}
                timeZone={timeZone}
                disabled={!data || !m?.closedTrades}
                onRecap={({ recap, scope, analyses }) => {
                  setLastRecap({ key: `${date}:${timeZone}:${query}`, text: recap });
                  // Append to the current draft, including edits made while AI was running.
                  const section = `## ${t("AI recap")}\n\n${scope.label.replace(/[\\`*_{}\[\]<>#]/g, "").replace(/[\r\n]+/g, " ")}\n\n${analysesUsedMarkdown(analyses)}${recap}`;
                  change(appended("\n\n---\n\n", section));
                }}
              />
            </div>
            {data ? (
              <RichEditor
                editorRef={noteEditor}
                value={noteValue}
                onChange={scheduleSave}
                analysisDay={date}
              />
            ) : error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : (
              <Skeleton className="h-48" />
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span role="status">{savingLabel(saving, t)}</span>
              <Button variant="ghost" size="sm" onClick={() => void flush()}>
                {t("Save now")}
              </Button>
            </div>
            <ReviewExport
              containsFinancialData
              document={{
                title: t("Daily review · {date}", { date }),
                subtitle: query ? t("Filters: {filters}", { filters: query }) : t("All accounts"),
                lines: [
                  t("Closed trades: {count} | Net P&L: {pnl}", {
                    count: m?.closedTrades ?? 0,
                    pnl: m?.netPnl.toFixed(2) ?? "0.00",
                  }),
                  "",
                  noteValue,
                ],
              }}
            />
            <Attachments type="day" id={date} />
          </CardContent>
        </Card>
        <ExternalOpinions
          date={date}
          note={noteValue}
          onAdd={(markdown) => change(appended("\n\n---\n\n", markdown))}
        />
        <Card>
          <CardHeader>
            <CardTitle>{t("Ask about this day")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3">
              <SimilarPast similarTo={{ date }} label={t("Find similar past days")} />
            </div>
            <JournalChat
              key={`${date}:${timeZone}:${query}`}
              target={{ kind: "day", date, filters, timeZone }}
              openId={chatId}
              seed={lastRecap?.key === `${date}:${timeZone}:${query}` ? lastRecap.text : null}
              placeholder={lastRecap ? t("Ask about the recap") : t("Ask about this day's trades")}
              intro={t(
                "Uses the selected filters, like recaps. The AI can read the day's trades, plans and charts, and compare with other days.",
              )}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** The autosave status in the journal's language ("Not saved: …" keeps the reason). */
function savingLabel(status: string, t: (text: string, vars?: Record<string, string>) => string) {
  const failed = status.match(/^Not saved: (.*)$/s);
  return failed ? t("Not saved: {reason}", { reason: t(failed[1]!) }) : status && t(status);
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tnum">{children}</div>
    </div>
  );
}
