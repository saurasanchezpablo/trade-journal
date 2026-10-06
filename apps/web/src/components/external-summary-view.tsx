"use client";

import type { ExternalSummary, Scenario } from "@/lib/external-summary";
import { useI18n } from "./i18n";
import { Badge } from "./ui/badge";

const price = (n: number) => String(Number(n.toPrecision(8)));
/** The prices, or null when none were said. */
const priceList = (list: number[]) => (list.length ? list.map(price).join(", ") : null);

/** Direction as a text chip; color only reinforces it. */
export function DirectionChip({ direction }: { direction: "long" | "short" | "neutral" }) {
  const { tx } = useI18n();
  return (
    <Badge variant={direction === "long" ? "profit" : direction === "short" ? "loss" : "secondary"}>
      {tx("direction", direction.toUpperCase())}
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
  const { t } = useI18n();
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
          <dt className="text-muted-foreground">{t("Trigger")}</dt>
          <dd>{scenario.trigger ?? t("none said")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("Targets")}</dt>
          <dd className="tnum">{priceList(scenario.targets) ?? t("none said")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("Invalid at")}</dt>
          <dd className="tnum">
            {scenario.invalidation === null ? t("none said") : price(scenario.invalidation)}
          </dd>
        </div>
      </dl>
      {reasons.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">{t("Why")}</p>
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
  const { t, tx } = useI18n();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("Bias")}</span>
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
            label={t("Main scenario")}
            scenario={summary.mainScenario}
            reasons={summary.mainReasons}
          />
        ) : (
          <p className="text-xs text-muted-foreground">{t("No main scenario given.")}</p>
        )}
        {summary.secondaryScenario ? (
          <ScenarioBox
            label={t("Secondary scenario")}
            scenario={summary.secondaryScenario}
            reasons={summary.secondaryReasons}
          />
        ) : (
          <p className="text-xs text-muted-foreground">{t("No secondary scenario given.")}</p>
        )}
      </div>
      {summary.openTrades.length > 0 && (
        <section aria-label={t("Their open trades")} className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {t("Their open trades")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-2 font-normal">{t("Instrument")}</th>
                  <th className="py-1 pr-2 font-normal">{t("Side")}</th>
                  <th className="py-1 pr-2 font-normal">{t("Entry")}</th>
                  <th className="py-1 pr-2 font-normal">{t("Stop loss")}</th>
                  <th className="py-1 pr-2 font-normal">{t("Take profit")}</th>
                  <th className="py-1 font-normal">{t("Note")}</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {summary.openTrades.map((trade, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1 pr-2">{trade.instrument}</td>
                    <td className="py-1 pr-2">
                      <DirectionChip direction={trade.direction} />
                    </td>
                    <td className="py-1 pr-2">{trade.entry === null ? "–" : price(trade.entry)}</td>
                    <td className="py-1 pr-2">
                      {trade.stopLoss === null ? "–" : price(trade.stopLoss)}
                    </td>
                    <td className="py-1 pr-2">{priceList(trade.takeProfits) ?? "–"}</td>
                    <td className="py-1">{trade.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {summary.tradeIdeas.length > 0 && (
        <section aria-label={t("Trade ideas")} className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {t("When to go long or short")}
          </p>
          <ul className="space-y-1.5">
            {summary.tradeIdeas.map((idea, i) => (
              <li key={i} className="rounded-md border p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <DirectionChip direction={idea.direction} />
                  <span className="font-medium">{idea.instrument}</span>
                  {idea.when && <span className="text-muted-foreground">{idea.when}</span>}
                </div>
                <p className="tnum mt-1 text-xs">
                  {t("Entry {entry} · stop loss {stop} · take profits {targets}", {
                    entry:
                      idea.entryLow !== null &&
                      idea.entryHigh !== null &&
                      idea.entryLow !== idea.entryHigh
                        ? t("{low} to {high}", {
                            low: price(idea.entryLow),
                            high: price(idea.entryHigh),
                          })
                        : idea.entryLow !== null || idea.entryHigh !== null
                          ? price((idea.entryLow ?? idea.entryHigh)!)
                          : t("not said"),
                    stop: idea.stopLoss === null ? t("not said") : price(idea.stopLoss),
                    targets: priceList(idea.takeProfits) ?? t("none said"),
                  })}
                </p>
                {idea.note && <p className="text-xs text-muted-foreground">{idea.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {summary.keyLevels.length > 0 && (
        <p className="text-xs">
          <span className="text-muted-foreground">{t("Key levels:")} </span>
          {summary.keyLevels
            .map(
              (l) =>
                `${l.instrument ? `${l.instrument} ` : ""}${price(l.price)} (${tx("level kind", l.kind)}${l.note ? `, ${l.note}` : ""})`,
            )
            .join("; ")}
        </p>
      )}
      {summary.caveats.length > 0 && (
        <div className="text-xs">
          <p className="text-muted-foreground">{t("Caveats")}</p>
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
