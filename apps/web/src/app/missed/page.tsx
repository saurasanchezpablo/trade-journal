"use client";
import { OptionSelect } from "@/components/ui/option-select";
import { Checkbox } from "@/components/ui/checkbox";

import { Suspense, useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { useI18n } from "@/components/i18n";
import { Field, fieldClass } from "@/components/filter-fields";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichEditor, Markdown } from "@/components/rich-editor";
import { Attachments } from "@/components/attachments";
import { ReviewExport } from "@/components/review-export";
import { MonetaryValue, MonetaryField } from "@/components/privacy";
import { useApi, postJson } from "@/lib/use-api";
interface Missed {
  id: string;
  symbol: string;
  direction: string;
  observedAt: string;
  entry: number | null;
  stop: number | null;
  target: number | null;
  playbookId: string | null;
  notes: string;
  archivedAt: string | null;
}
const blank = () => ({
  symbol: "",
  direction: "long",
  observedAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16),
  entry: "",
  stop: "",
  target: "",
  playbookId: "",
  notes: "",
});
export default function MissedPage() {
  return (
    <Suspense>
      <Missed />
    </Suspense>
  );
}
function Missed() {
  const { t, tx, intl } = useI18n();
  const { data, error, refresh } = useApi<{ trades: Missed[] }>("/api/workspace/missed"),
    { data: books } = useApi<{ playbooks: { id: string; name: string }[] }>("/api/playbooks");
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState(blank),
    [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  function edit(item?: Missed) {
    setEditing(item?.id ?? null);
    setDraft(
      item
        ? {
            symbol: item.symbol,
            direction: item.direction,
            observedAt: new Date(
              Date.parse(item.observedAt) - new Date(item.observedAt).getTimezoneOffset() * 60000,
            )
              .toISOString()
              .slice(0, 16),
            entry: item.entry?.toString() ?? "",
            stop: item.stop?.toString() ?? "",
            target: item.target?.toString() ?? "",
            playbookId: item.playbookId ?? "",
            notes: item.notes,
          }
        : blank(),
    );
    setFailure("");
    setOpen(true);
  }
  const rows =
    data?.trades.filter(
      (item) =>
        Boolean(item.archivedAt) === archived &&
        `${item.symbol} ${item.notes}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  const formField = (
    key: "symbol" | "observedAt" | "entry" | "stop" | "target",
    label: string,
    type = "text",
  ) => (
    <Field label={t(label)}>
      <MonetaryField sensitive={type === "number"}>
        <input
          className={fieldClass}
          type={type}
          step={type === "number" ? "any" : undefined}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      </MonetaryField>
    </Field>
  );
  return (
    <div>
      <FilterBar
        title={t("Missed trades")}
        actions={
          <Button size="sm" onClick={() => edit()}>
            {t("Log opportunity")}
          </Button>
        }
      />
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          {t(
            "Record setups you watched but did not take. These observations never enter your trade count, P&L, or win rate.",
          )}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <input
            aria-label={t("Search missed trades")}
            className={`${fieldClass} max-w-sm`}
            placeholder={t("Search symbol or notes")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={archived}
              onCheckedChange={(checked) => setArchived(checked === true)}
            />
            {t("Show archived")}
          </label>
        </div>
        {(error || failure) && (
          <p role="alert" className="text-sm text-destructive">
            {error || failure}
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>
                    {item.symbol} · {item.direction === "short" ? t("short") : t("long")}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => edit(item)}>
                      {t("Edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await postJson(
                            "/api/workspace/missed",
                            { id: item.id, restore: !!item.archivedAt },
                            "DELETE",
                          );
                          refresh();
                        } catch (e) {
                          setFailure(String(e));
                        }
                      }}
                    >
                      {item.archivedAt ? t("Restore") : t("Archive")}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(item.observedAt).toLocaleString(intl)} ·{" "}
                  {books?.playbooks.find((b) => b.id === item.playbookId)?.name ?? t("No strategy")}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-5 text-sm">
                  {(
                    [
                      ["Entry", item.entry],
                      ["Stop", item.stop],
                      ["Target", item.target],
                    ] as const
                  ).map(([label, value]) => (
                    <span key={label}>
                      <span className="text-muted-foreground">{tx("chart level", label)}: </span>
                      <MonetaryValue>{value ?? "-"}</MonetaryValue>
                    </span>
                  ))}
                </div>
                <Markdown>{item.notes || t("No review yet.")}</Markdown>
                <ReviewExport
                  containsFinancialData
                  document={{
                    title: t("Missed opportunity · {symbol}", { symbol: item.symbol }),
                    subtitle: `${item.direction === "short" ? t("short") : t("long")} · ${item.observedAt}`,
                    lines: [
                      t("Observation only: no executed trade or actual P&L."),
                      t("Planned entry: {entry} | Stop: {stop} | Target: {target}", {
                        entry: item.entry ?? "-",
                        stop: item.stop ?? "-",
                        target: item.target ?? "-",
                      }),
                      "",
                      item.notes,
                    ],
                  }}
                />
                <Attachments type="missed" id={item.id} />
              </CardContent>
            </Card>
          ))}
        </div>
        {data && !rows.length && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {archived ? t("No archived opportunities here yet.") : t("No opportunities here yet.")}
          </p>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editing ? t("Edit opportunity") : t("Log a missed opportunity")}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {formField("symbol", "Symbol")}
              <Field label={t("Direction")}>
                <OptionSelect
                  className={fieldClass}
                  value={draft.direction}
                  onValueChange={(next) => setDraft({ ...draft, direction: next })}
                >
                  <option value="long">{t("Long")}</option>
                  <option value="short">{t("Short")}</option>
                </OptionSelect>
              </Field>
              {formField("observedAt", "Observed at (device time)", "datetime-local")}
              <Field label={t("Strategy")}>
                <OptionSelect
                  className={fieldClass}
                  value={draft.playbookId}
                  onValueChange={(next) => setDraft({ ...draft, playbookId: next })}
                >
                  <option value="">{t("No strategy")}</option>
                  {books?.playbooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </OptionSelect>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {formField("entry", "Planned entry", "number")}
              {formField("stop", "Planned stop", "number")}
              {formField("target", "Planned target", "number")}
            </div>
            <RichEditor
              defaultMode="edit"
              value={draft.notes}
              onChange={(notes) => setDraft({ ...draft, notes })}
              placeholder={t("Why did you miss it? What will you do differently?")}
            />
            {failure && (
              <p role="alert" className="text-xs text-destructive">
                {failure}
              </p>
            )}
            <Button
              disabled={busy || !draft.symbol.trim() || !draft.observedAt}
              onClick={async () => {
                setBusy(true);
                try {
                  await postJson("/api/workspace/missed", {
                    ...draft,
                    id: editing,
                    observedAt: new Date(draft.observedAt).toISOString(),
                    entry: draft.entry === "" ? null : Number(draft.entry),
                    stop: draft.stop === "" ? null : Number(draft.stop),
                    target: draft.target === "" ? null : Number(draft.target),
                  });
                  setOpen(false);
                  refresh();
                  setFailure("");
                } catch (e) {
                  setFailure(e instanceof Error ? e.message : t("Could not save."));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Save opportunity")}
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
