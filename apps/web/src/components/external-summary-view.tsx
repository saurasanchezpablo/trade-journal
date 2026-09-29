"use client";

import type { ExternalSummary, Scenario } from "@/lib/external-summary";
import { Badge } from "./ui/badge";

const price = (n: number) => String(Number(n.toPrecision(8)));
const prices = (list: number[]) => (list.length ? list.map(price).join(", ") : "none said");

/** Direction as a text chip; color only reinforces it. */
export function DirectionChip({ direction }: { direction: "long" | "short" | "neutral" }) {
  return (
    <Badge variant={direction === "long" ? "profit" : direction === "short" ? "loss" : "secondary"}>
      {direction.toUpperCase()}
    </Badge>
  );
}

function ScenarioBox({
  label,
  scenario,
  reasons,
}: {
  label: string;
  scenario: Scenario;
  reasons: string[];
}) {
  return (
    <section className="space-y-1.5 rounded-md border p-3" aria-label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        <DirectionChip direction={scenario.direction} />
        {scenario.instrument && (
          <span className="text-xs text-muted-foreground">{scenario.instrument}</span>
        )}
        {scenario.likelihood && (
          <span className="text-xs text-muted-foreground">· {scenario.likelihood}</span>
        )}
      </div>
      <p className="text-sm font-medium">{scenario.title}</p>
      <p className="text-sm">{scenario.description}</p>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-x-4 gap-y-0.5 text-xs">
        <div>
          <dt className="text-muted-foreground">Trigger</dt>
          <dd>{scenario.trigger ?? "none said"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Targets</dt>
          <dd className="tnum">{prices(scenario.targets)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Invalid at</dt>
          <dd className="tnum">
            {scenario.invalidation === null ? "none said" : price(scenario.invalidation)}
          </dd>
        </div>
      </dl>
      {reasons.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">Why</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** An external analysis as a trader's notes: scenarios, their reasons, trades and levels. */
export function ExternalSummaryView({
  summary,
  compact = false,
}: {
  summary: ExternalSummary;
  /** In a narrow card: the scenarios one under the other. */
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Bias</span>
        <DirectionChip direction={summary.bias} />
        {summary.instruments.length > 0 && (
          <span className="text-xs text-muted-foreground">{summary.instruments.join(", ")}</span>
        )}
        {summary.timeframe && (
          <span className="text-xs text-muted-foreground">· {summary.timeframe}</span>
        )}
      </div>
      <p className="text-sm leading-relaxed">{summary.overview}</p>
      <div className={compact ? "grid gap-3" : "grid gap-3 lg:grid-cols-2"}>
        {summary.mainScenario ? (
          <ScenarioBox
            label="Main scenario"
            scenario={summary.mainScenario}
            reasons={summary.mainReasons}
          />
        ) : (
          <p className="text-xs text-muted-foreground">No main scenario given.</p>
        )}
        {summary.secondaryScenario ? (
          <ScenarioBox
            label="Secondary scenario"
            scenario={summary.secondaryScenario}
            reasons={summary.secondaryReasons}
          />
        ) : (
          <p className="text-xs text-muted-foreground">No secondary scenario given.</p>
        )}
      </div>
      {summary.openTrades.length > 0 && (
        <section aria-label="Their open trades" className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Their open trades
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-2 font-normal">Instrument</th>
                  <th className="py-1 pr-2 font-normal">Side</th>
                  <th className="py-1 pr-2 font-normal">Entry</th>
                  <th className="py-1 pr-2 font-normal">Stop loss</th>
                  <th className="py-1 pr-2 font-normal">Take profit</th>
                  <th className="py-1 font-normal">Note</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {summary.openTrades.map((t, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1 pr-2">{t.instrument}</td>
                    <td className="py-1 pr-2">
                      <DirectionChip direction={t.direction} />
                    </td>
                    <td className="py-1 pr-2">{t.entry === null ? "–" : price(t.entry)}</td>
                    <td className="py-1 pr-2">{t.stopLoss === null ? "–" : price(t.stopLoss)}</td>
                    <td className="py-1 pr-2">
                      {t.takeProfits.length ? prices(t.takeProfits) : "–"}
                    </td>
                    <td className="py-1">{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {summary.tradeIdeas.length > 0 && (
        <section aria-label="Trade ideas" className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            When to go long or short
          </p>
          <ul className="space-y-1.5">
            {summary.tradeIdeas.map((t, i) => (
              <li key={i} className="rounded-md border p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <DirectionChip direction={t.direction} />
                  <span className="font-medium">{t.instrument}</span>
                  {t.when && <span className="text-muted-foreground">{t.when}</span>}
                </div>
                <p className="tnum mt-1 text-xs">
                  Entry{" "}
                  {t.entryLow !== null && t.entryHigh !== null && t.entryLow !== t.entryHigh
                    ? `${price(t.entryLow)} to ${price(t.entryHigh)}`
                    : t.entryLow !== null || t.entryHigh !== null
                      ? price((t.entryLow ?? t.entryHigh)!)
                      : "not said"}{" "}
                  · stop loss {t.stopLoss === null ? "not said" : price(t.stopLoss)} · take profits{" "}
                  {prices(t.takeProfits)}
                </p>
                {t.note && <p className="text-xs text-muted-foreground">{t.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {summary.keyLevels.length > 0 && (
        <p className="text-xs">
          <span className="text-muted-foreground">Key levels: </span>
          {summary.keyLevels
            .map(
              (l) =>
                `${l.instrument ? `${l.instrument} ` : ""}${price(l.price)} (${l.kind}${l.note ? `, ${l.note}` : ""})`,
            )
            .join("; ")}
        </p>
      )}
      {summary.caveats.length > 0 && (
        <div className="text-xs">
          <p className="text-muted-foreground">Caveats</p>
          <ul className="list-disc pl-5">
            {summary.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
