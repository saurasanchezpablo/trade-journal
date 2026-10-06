"use client";
import { JournalChat } from "@/components/journal-chat";
import { postAiStream } from "@/lib/ai-stream";
import { TradeLabelSuggestions } from "@/components/label-suggestions";
import { VoiceMemo } from "@/components/voice-memo";
import { SimilarPast } from "@/components/note-search";
import { tradeSnapshot } from "@/lib/trade-snapshot";
import { AiNotice } from "@/components/ai-notice";
import { Checkbox } from "@/components/ui/checkbox";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Sparkles, Star } from "lucide-react";
import { TradeFillsEditor } from "@/components/trade-fills-editor";
import { FillCorrections } from "@/components/fill-corrections";
import { FilterBar } from "@/components/filter-bar";
import { useI18n } from "@/components/i18n";
import { Pnl } from "@/components/pnl";
import { MonetaryValue, MonetaryField } from "@/components/privacy";
import { TradeMarketData } from "@/components/trade-market-data";
import { EquityArea } from "@/components/charts/equity-area";
import { VoiceNote } from "@/components/voice-note";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RichEditor, type RichEditorHandle } from "@/components/rich-editor";
import {
  AiChartsToggle,
  AiChartsUsed,
  useAiCharts,
  type AiAnalysisUsed,
} from "@/components/ai-charts-option";
import { Attachments } from "@/components/attachments";
import { ReviewExport } from "@/components/review-export";
import { RuleChecklist } from "@/components/rule-checklist";
import { useAutosave } from "@/lib/use-autosave";
import { postJson, useApi } from "@/lib/use-api";
import { NOT_A_NUMBER, parseDecimalInput } from "@/lib/number-input";
import { fmtDuration, fmtMoney, fmtNumber, fmtPercent } from "@/lib/utils";
import { tradeKeyFromSegment, tradePath } from "@/lib/trade-links";
import { formatTimestamp } from "@/lib/timezone";

interface TradeDetail {
  riskAmount: number | null;
  realizedR: number | null;
  plannedR: number | null;
  contractMultiplier: number | null;
  currency: string;
  key: string;
  accountId: string;
  symbol: string;
  assetClass: string | null;
  direction: "long" | "short";
  status: string;
  openedAt: string;
  closedAt: string | null;
  quantity: number;
  avgEntry: number;
  avgExit: number | null;
  grossPnl: number;
  fees: number;
  netPnl: number;
  durationMs: number | null;
  exitsJson: string;
  notes: string | null;
  tagsJson: string | null;
  mistakesJson: string | null;
  playbookId: string | null;
  rating: number | null;
  stopLoss: number | null;
  profitTarget: number | null;
  reviewedAt: string | null;
}

/** The displayed word for a trade status (the API value stays as it is). */
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  win: "Win",
  loss: "Loss",
  breakeven: "Breakeven",
};

/** An autosave status line in the journal's language. */
function autosaveText(status: string, t: (text: string, vars?: Record<string, string>) => string) {
  const failed = /^Not saved: (.*)$/s.exec(status);
  if (failed) return t("Not saved: {reason}", { reason: t(failed[1] ?? "") });
  return status ? t(status) : status;
}

interface ExecutionRow {
  id: string;
  symbol: string;
  source: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  executedAt: string;
}

export default function TradePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const tradeKey = tradeKeyFromSegment(key);
  return <TradeView key={tradeKey} tradeKey={tradeKey} />;
}

function TradeView({ tradeKey }: { tradeKey: string }) {
  const { t, tx } = useI18n();
  const { data, error, refresh } = useApi<{
    trade: TradeDetail;
    executions: ExecutionRow[];
    timeZone: string;
  }>(`/api/trades/${encodeURIComponent(tradeKey)}`);
  const [aiBusy, setAiBusy] = useState(false);
  const [critique, setCritique] = useState<string | null>(null);
  const [critiqueCharts, setCritiqueCharts] = useState<AiAnalysisUsed[]>([]);
  const [aiCharts, setAiCharts] = useAiCharts();
  const [aiError, setAiError] = useState<string | null>(null);
  const [editingFills, setEditingFills] = useState(false);
  const [correctionsSeen, setCorrectionsSeen] = useState(0);
  const router = useRouter();

  if (!data) {
    return (
      <div>
        <FilterBar title={t("Trade")} />
        <div className="p-4">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : (
            <Skeleton className="h-96" />
          )}
        </div>
      </div>
    );
  }
  const { trade, executions, timeZone } = data;

  const patch = async (body: Record<string, unknown>) => {
    if (Object.keys(body).length)
      await postJson(`/api/trades/${encodeURIComponent(tradeKey)}`, body, "PATCH");
    refresh();
  };

  const runningPnl = (() => {
    const exits = JSON.parse(trade.exitsJson) as {
      executionId: string;
      grossPnl: number;
      quantity: number;
    }[];
    const times = new Map(executions.map((e) => [e.id, e.executedAt]));
    const totalExitQty = exits.reduce((total, exit) => total + exit.quantity, 0);
    let cum = 0;
    return exits
      .map((exit) => ({
        t: times.get(exit.executionId) ?? trade.openedAt,
        pnl: exit.grossPnl - (totalExitQty > 0 ? trade.fees * (exit.quantity / totalExitQty) : 0),
      }))
      .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
      .map((event) => ({
        t: formatTimestamp(event.t, timeZone).slice(11, 16),
        cumNetPnl: (cum += event.pnl),
      }));
  })();

  const askCritique = async () => {
    setAiBusy(true);
    setAiError(null);
    try {
      setCritique(null);
      setCritiqueCharts([]);
      const chartImage = aiCharts ? tradeSnapshot(tradeKey) : null;
      const result = await postAiStream<{ critique: string; analyses?: AiAnalysisUsed[] }>(
        "/api/ai/critique",
        {
          key: tradeKey,
          ...(aiCharts ? {} : { includeAnalyses: false }),
          // The market replay chart's picture, when it is on screen.
          ...(chartImage ? { chartImage } : {}),
        },
        setCritique,
      );
      setCritique(result.critique);
      setCritiqueCharts(result.analyses ?? []);
    } catch (error) {
      // A critique cut short is not kept.
      setCritique(null);
      setAiError(error instanceof Error ? error.message : t("AI critique failed"));
    } finally {
      setAiBusy(false);
    }
  };

  const riskAmount = trade.riskAmount;

  return (
    <div>
      <FilterBar
        title={`${trade.symbol} · ${(trade.direction === "short" ? t("Short") : t("Long")).toUpperCase()}`}
      />
      <div className="grid gap-3 p-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-3 xl:col-span-2">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
              <div>
                <div className="text-xs text-muted-foreground">{t("Net P&L")}</div>
                <Pnl value={trade.netPnl} className="text-2xl font-semibold" />
              </div>
              <Badge
                variant={
                  trade.status === "win" ? "profit" : trade.status === "loss" ? "loss" : "secondary"
                }
                className="text-sm"
              >
                {tx("status", STATUS_LABEL[trade.status] ?? trade.status).toUpperCase()}
              </Badge>
              <Meta label={t("Gross")} value={fmtMoney(trade.grossPnl)} monetary />
              <Meta label={t("Fees")} value={fmtMoney(trade.fees)} monetary />
              <Meta label={t("Volume")} value={fmtNumber(trade.quantity, 4)} />
              <Meta label={t("Avg entry")} value={fmtNumber(trade.avgEntry)} monetary />
              <Meta
                label={t("Avg exit")}
                monetary
                value={
                  trade.avgExit === null
                    ? tx("status", "Open").toLowerCase()
                    : fmtNumber(trade.avgExit)
                }
              />
              <Meta label={t("Duration")} value={fmtDuration(trade.durationMs)} />
              <Meta
                label={t("Net / entry notional")}
                value={fmtPercent(
                  trade.avgEntry * trade.quantity > 0 &&
                    (trade.contractMultiplier !== null ||
                      !["futures", "option", "forex", "cfd"].includes(trade.assetClass ?? ""))
                    ? trade.netPnl /
                        (Math.abs(trade.avgEntry) *
                          trade.quantity *
                          (trade.contractMultiplier ?? 1))
                    : null,
                  2,
                )}
              />
              <Meta
                label={t("Planned R")}
                value={trade.plannedR === null ? "–" : `${fmtNumber(trade.plannedR)}R`}
              />
              <Meta
                label={t("Realized R")}
                value={trade.realizedR === null ? "–" : `${fmtNumber(trade.realizedR)}R`}
              />
            </CardContent>
          </Card>

          <TradeMarketData trade={trade} executions={executions} />

          {runningPnl.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("Running P&L")}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t("Times in {timeZone}", { timeZone })}
                </p>
              </CardHeader>
              <CardContent>
                <EquityArea data={runningPnl} height={180} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
              <div className="space-y-1.5">
                <CardTitle>{t("Executions")}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t("Times in {timeZone}", { timeZone })}
                </p>
              </div>
              {!editingFills && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  title={t(
                    "Correct a wrong price, quantity, side, fee, time or symbol, or add or remove a fill",
                  )}
                  onClick={() => setEditingFills(true)}
                >
                  <Pencil /> {t("Edit fills")}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {editingFills ? (
                <TradeFillsEditor
                  tradeKey={trade.key}
                  symbol={executions[0]?.symbol ?? trade.symbol}
                  fills={executions}
                  timeZone={timeZone}
                  imported={executions.some((e) => e.source !== "manual")}
                  onCancel={() => setEditingFills(false)}
                  onSaved={(next) => {
                    setEditingFills(false);
                    setCorrectionsSeen((n) => n + 1);
                    if (!next) router.push("/trades");
                    else if (next !== trade.key) router.replace(tradePath(next));
                    else refresh();
                  }}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Time")}</TableHead>
                      <TableHead>{t("Side")}</TableHead>
                      <TableHead>{t("Quantity")}</TableHead>
                      <TableHead>{t("Price")}</TableHead>
                      <TableHead>{t("Fee")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...executions]
                      .sort((a, b) => a.executedAt.localeCompare(b.executedAt))
                      .map((execution) => (
                        <TableRow key={execution.id}>
                          <TableCell className="text-muted-foreground">
                            {formatTimestamp(execution.executedAt, timeZone)}
                          </TableCell>
                          <TableCell>
                            <span
                              className={execution.side === "buy" ? "text-profit" : "text-loss"}
                            >
                              {execution.side === "buy"
                                ? `▲ ${t("Buy").toUpperCase()}`
                                : `▼ ${t("Sell").toUpperCase()}`}
                            </span>
                          </TableCell>
                          <TableCell className="tnum">{fmtNumber(execution.quantity, 4)}</TableCell>
                          <TableCell className="tnum">
                            <MonetaryValue>{fmtNumber(execution.price)}</MonetaryValue>
                          </TableCell>
                          <TableCell className="tnum text-muted-foreground">
                            <MonetaryValue>{fmtMoney(execution.fee)}</MonetaryValue>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
              <FillCorrections tradeKey={trade.key} timeZone={timeZone} version={correctionsSeen} />
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-3">
          <AnnotationsCard key={trade.key} trade={trade} onPatch={patch} />
          <RuleChecklist tradeKey={trade.key} playbookId={trade.playbookId} />
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t("AI review")}</CardTitle>
              <Button variant="outline" size="sm" onClick={askCritique} disabled={aiBusy}>
                <Sparkles />
                {aiBusy ? t("Thinking…") : t("Critique this trade")}
              </Button>
            </CardHeader>
            <CardContent className="pb-0">
              <AiChartsToggle checked={aiCharts} onChange={setAiCharts} />
            </CardContent>
            {aiError && (
              <CardContent>
                <AiNotice
                  error={aiError}
                  onRetry={() => void askCritique()}
                  onDismiss={() => setAiError(null)}
                />
              </CardContent>
            )}
            {critique && (
              <CardContent className="space-y-2">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{critique}</p>
                <AiChartsUsed analyses={critiqueCharts} />
              </CardContent>
            )}
            <CardContent>
              <SimilarPast
                similarTo={{ tradeKey: trade.key }}
                label={t("Find similar past trades")}
              />
            </CardContent>
            <CardContent>
              <JournalChat
                key={`${trade.key}:${timeZone}`}
                target={{ kind: "trade", tradeKey: trade.key, timeZone }}
                seed={aiBusy ? null : critique}
                placeholder={critique ? t("Ask about the critique") : t("Ask about this trade")}
                intro={t(
                  "Chats about this trade can look up its fills, candles and your other trades in its account.",
                )}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  monetary = false,
}: {
  label: string;
  value: string;
  monetary?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tnum text-sm font-medium">
        {monetary ? <MonetaryValue>{value}</MonetaryValue> : value}
      </div>
    </div>
  );
}

function AnnotationsCard({
  trade,
  onPatch,
}: {
  trade: TradeDetail;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const { t, tn, tx } = useI18n();
  const [notes, setNotes] = useState(trade.notes ?? "");
  const noteEditor = useRef<RichEditorHandle>(null);
  const [tags, setTags] = useState((JSON.parse(trade.tagsJson ?? "[]") as string[]).join(", "));
  const [mistakes, setMistakes] = useState(
    (JSON.parse(trade.mistakesJson ?? "[]") as string[]).join(", "),
  );
  const [stopLoss, setStopLoss] = useState(trade.stopLoss?.toString() ?? "");
  const [profitTarget, setProfitTarget] = useState(trade.profitTarget?.toString() ?? "");
  const { data: playbookData } = useApi<{ playbooks: { id: string; name: string }[] }>(
    "/api/playbooks",
  );
  const {
    save: debounced,
    status: saveStatus,
    flush,
  } = useAutosave(`/api/trades/${encodeURIComponent(trade.key)}`, "PATCH", () => void onPatch({}));

  const parseList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Journal this trade")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => void onPatch({ rating: trade.rating === star ? null : star })}
                aria-label={tn(star, "Rate {count} star", "Rate {count} stars")}
              >
                <Star
                  className={`h-4 w-4 ${trade.rating !== null && star <= trade.rating ? "fill-current text-series-4 text-yellow-600" : "text-muted-foreground"}`}
                />
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={trade.reviewedAt !== null}
              onCheckedChange={(checked) => void onPatch({ reviewed: checked === true })}
            />
            {t("Reviewed")}
          </label>
        </div>

        <TradeLabelSuggestions
          tradeKey={trade.key}
          onApply={async (labels) => {
            if (labels.tags) setTags(labels.tags.join(", "));
            if (labels.mistakes) setMistakes(labels.mistakes.join(", "));
            await flush();
            await onPatch({ ...labels });
          }}
        />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="trade-stop-loss" className="text-xs text-muted-foreground">
              {t("Stop loss")}
            </label>
            <MonetaryField>
              <Input
                id="trade-stop-loss"
                value={stopLoss}
                onChange={(event) => {
                  setStopLoss(event.target.value);
                  const value = parseDecimalInput(event.target.value);
                  if (value !== undefined) debounced({ stopLoss: value });
                }}
                aria-invalid={parseDecimalInput(stopLoss) === undefined}
                placeholder={t("planned stop")}
                inputMode="decimal"
              />
            </MonetaryField>
            {parseDecimalInput(stopLoss) === undefined && (
              <p className="mt-1 text-xs text-destructive">{t(NOT_A_NUMBER)}</p>
            )}
          </div>
          <div>
            <label htmlFor="trade-profit-target" className="text-xs text-muted-foreground">
              {t("Profit target")}
            </label>
            <MonetaryField>
              <Input
                id="trade-profit-target"
                value={profitTarget}
                onChange={(event) => {
                  setProfitTarget(event.target.value);
                  const value = parseDecimalInput(event.target.value);
                  if (value !== undefined) debounced({ profitTarget: value });
                }}
                aria-invalid={parseDecimalInput(profitTarget) === undefined}
                placeholder={t("planned target")}
                inputMode="decimal"
              />
            </MonetaryField>
            {parseDecimalInput(profitTarget) === undefined && (
              <p className="mt-1 text-xs text-destructive">{t(NOT_A_NUMBER)}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="trade-playbook" className="text-xs text-muted-foreground">
            {t("Playbook")}
          </label>
          <Select
            value={trade.playbookId ?? "none"}
            onValueChange={(value) => void onPatch({ playbookId: value === "none" ? null : value })}
          >
            <SelectTrigger id="trade-playbook">
              <SelectValue placeholder={t("No playbook")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("No playbook")}</SelectItem>
              {playbookData?.playbooks.map((playbook) => (
                <SelectItem key={playbook.id} value={playbook.id}>
                  {playbook.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="trade-tags" className="text-xs text-muted-foreground">
            {t("Tags (comma-separated)")}
          </label>
          <Input
            id="trade-tags"
            value={tags}
            onChange={(event) => {
              setTags(event.target.value);
              debounced({ tags: parseList(event.target.value) });
            }}
            placeholder={t("breakout, A+ setup")}
          />
        </div>
        <div>
          <label htmlFor="trade-mistakes" className="text-xs text-muted-foreground">
            {t("Mistakes")}
          </label>
          <Input
            id="trade-mistakes"
            value={mistakes}
            onChange={(event) => {
              setMistakes(event.target.value);
              debounced({ mistakes: parseList(event.target.value) });
            }}
            placeholder={t("chased entry, moved stop")}
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-muted-foreground">{t("Notes")}</label>
            <VoiceNote
              onPrepare={() => noteEditor.current?.focus()}
              onText={(text) => {
                const next = notes ? `${notes} ${text}` : text;
                setNotes(next);
                debounced({ notes: next });
              }}
            />
          </div>
          <div className="mb-2">
            <VoiceMemo
              kind="trade"
              onInsert={(markdown) => {
                const next = notes ? `${notes}\n\n${markdown}` : markdown;
                setNotes(next);
                debounced({ notes: next });
              }}
            />
          </div>
          <RichEditor
            editorRef={noteEditor}
            value={notes}
            onChange={(value) => {
              setNotes(value);
              debounced({ notes: value });
            }}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span role="status">{autosaveText(saveStatus, t)}</span>
            <Button variant="ghost" size="sm" onClick={() => void flush()}>
              {t("Save now")}
            </Button>
          </div>
          <ReviewExport
            containsFinancialData
            document={{
              title: t("{symbol} · {direction} review", {
                symbol: trade.symbol,
                direction: trade.direction === "short" ? t("short") : t("long"),
              }),
              subtitle: `${trade.openedAt} · ${trade.currency}`,
              lines: [
                t("Status: {status} | Quantity: {quantity}", {
                  status: tx("status", STATUS_LABEL[trade.status] ?? trade.status).toLowerCase(),
                  quantity: trade.quantity,
                }),
                t("Entry: {entry} | Exit: {exit}", {
                  entry: trade.avgEntry,
                  exit: trade.avgExit ?? tx("status", "Open"),
                }),
                t("Net P&L: {net} | Fees: {fees}", {
                  net: trade.netPnl.toFixed(2),
                  fees: trade.fees.toFixed(2),
                }),
                t("Stop: {stop} | Target: {target}", {
                  stop: stopLoss || t("Unspecified"),
                  target: profitTarget || t("Unspecified"),
                }),
                t("Tags: {tags} | Mistakes: {mistakes}", {
                  tags: tags || t("None"),
                  mistakes: mistakes || t("None"),
                }),
                "",
                notes,
              ],
            }}
          />
          <Attachments type="trade" id={trade.key} />
        </div>
      </CardContent>
    </Card>
  );
}
