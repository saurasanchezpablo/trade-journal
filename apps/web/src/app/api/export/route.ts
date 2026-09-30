import {
  db,
  accounts,
  executions,
  journalDays,
  notes,
  playbooks,
  trades,
  attachments,
  noteTemplates,
  tradeRuleChecks,
  progressRules,
  progressChecks,
  missedTrades,
  folders,
  propAccounts,
  propEntries,
  propReceipts,
  propAudit,
  importSources,
  importSourceAliases,
  importBatches,
  chartAnalyses,
  chartAnalysisSnapshots,
  chartScripts,
  chartPlanReviews,
  chartTradeLinks,
} from "@/db";
import { readFilters } from "@luxalgo/journal-core";
import { parseDrawings } from "@/lib/chart-analysis";
import { parseLayers } from "@/lib/chart-layers";
import { parseIndicators } from "@/lib/chart-indicators";
import { parseZones } from "@/lib/sr-zones";
import { queryTrades } from "@/server/trades-query";
import {
  getJournalDefaults,
  getMultipliers,
  getTimeZone,
  getImportTimeZone,
} from "@/server/settings";
import { handler, ok } from "@/server/api";
import { getChartPreferences } from "@/server/chart-preferences";
import { attachmentExportRecord, EXPORT_ATTACHMENTS_NOTE } from "@/lib/export-format";
import { csvCell } from "@/lib/csv-cell";

/** Monthly and quarterly review goals (their table appears with the first goal). */
function reviewGoals() {
  const exists = db.$client
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'review_goals'")
    .get();
  if (!exists) return [];
  return (
    db.$client.prepare("SELECT * FROM review_goals ORDER BY created_at, rowid").all() as {
      id: string;
      period_kind: string;
      period: string;
      metric: string | null;
      comparator: string | null;
      target: number | null;
      text: string;
      created_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    periodKind: row.period_kind,
    period: row.period,
    metric: row.metric,
    comparator: row.comparator,
    target: row.target,
    text: row.text,
    createdAt: row.created_at,
  }));
}

/**
 * Full data export: your journal is yours. Credentials are deliberately
 * excluded: an export must be safe to share or move between machines.
 */
export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";

  if (format === "csv") {
    const header =
      "key,account_id,symbol,direction,status,opened_at,closed_at,quantity,avg_entry,avg_exit,gross_pnl,fees,net_pnl,tags,notes";
    const lines = queryTrades(readFilters(url.searchParams)).rows.map((row) =>
      [
        row.key,
        row.accountId,
        row.symbol,
        row.direction,
        row.status,
        row.openedAt,
        row.closedAt,
        row.quantity,
        row.avgEntry,
        row.avgExit,
        row.grossPnl,
        row.fees,
        row.netPnl,
        row.tagsJson ?? "[]",
        row.notes ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
    return new Response([header, ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="trades.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  }

  return ok({
    exportedAt: new Date().toISOString(),
    note: EXPORT_ATTACHMENTS_NOTE,
    accounts: db
      .select()
      .from(accounts)
      .all()
      .map(({ credentialsEnc: _omitted, ...safe }) => safe),
    executions: db.select().from(executions).all(),
    importSources: db.select().from(importSources).all(),
    importSourceAliases: db.select().from(importSourceAliases).all(),
    importBatches: db.select().from(importBatches).all(),
    trades: db.select().from(trades).all(),
    journalDays: db.select().from(journalDays).all(),
    notes: db.select().from(notes).all(),
    folders: db.select().from(folders).all(),
    playbooks: db.select().from(playbooks).all(),
    noteTemplates: db.select().from(noteTemplates).all(),
    tradeRuleChecks: db.select().from(tradeRuleChecks).all(),
    progressRules: db.select().from(progressRules).all(),
    progressChecks: db.select().from(progressChecks).all(),
    missedTrades: db.select().from(missedTrades).all(),
    propAccounts: db.select().from(propAccounts).all(),
    propEntries: db.select().from(propEntries).all(),
    propReceipts: db.select().from(propReceipts).all(),
    propAudit: db.select().from(propAudit).all(),
    // Drawings and sources; snapshot images stay in the data directory like attachments.
    chartAnalyses: db
      .select()
      .from(chartAnalyses)
      .all()
      .map(({ image, drawingsJson, layersJson, indicatorsJson, zonesJson, ...analysis }) => ({
        ...analysis,
        drawings: parseDrawings(drawingsJson),
        layers: parseLayers(layersJson),
        indicators: parseIndicators(indicatorsJson),
        zones: parseZones(zonesJson),
        hasSnapshot: image !== null,
      })),
    // Each day's version of an analysis, without its picture.
    chartAnalysisSnapshots: db
      .select()
      .from(chartAnalysisSnapshots)
      .all()
      .map(({ image, drawingsJson, layersJson, indicatorsJson, zonesJson, ...snapshot }) => ({
        ...snapshot,
        drawings: parseDrawings(drawingsJson),
        layers: parseLayers(layersJson),
        indicators: parseIndicators(indicatorsJson),
        zones: parseZones(zonesJson),
        hasSnapshot: image !== null,
      })),
    chartScripts: db.select().from(chartScripts).all(),
    // How each plan scenario went, and which trades were taken from which plan.
    chartPlanReviews: db.select().from(chartPlanReviews).all(),
    chartTradeLinks: db.select().from(chartTradeLinks).all(),
    reviewGoals: reviewGoals(),
    journalDefaults: getJournalDefaults(),
    settings: {
      timeZone: getTimeZone(),
      importTimeZone: getImportTimeZone(),
      multipliers: getMultipliers(),
      chartPreferences: getChartPreferences(),
    },
    // Metadata only: attachment binaries stay in the data directory.
    attachments: db
      .select({
        id: attachments.id,
        ownerType: attachments.ownerType,
        ownerId: attachments.ownerId,
        name: attachments.name,
        mime: attachments.mime,
        size: attachments.size,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .all()
      .map(attachmentExportRecord),
  });
});
