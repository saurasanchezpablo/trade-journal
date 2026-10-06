"use client";
import { DatePicker } from "@/components/ui/date-picker";
import { OptionSelect } from "@/components/ui/option-select";
import { Checkbox } from "@/components/ui/checkbox";

import { HoverHint } from "@/components/ui/tooltip";
import { Suspense, useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { Field, fieldClass } from "@/components/filter-fields";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReviewExport } from "@/components/review-export";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, postJson } from "@/lib/use-api";
import { scheduledRules, progressScore, type Routine, type RoutineCheck } from "@/lib/progress";
import { useI18n } from "@/components/i18n";
// Stage names are stored with each routine: the English is the value, translated when shown.
const STAGES = ["Before trading", "During trading", "After trading"];
export default function ProgressPage() {
  return (
    <Suspense>
      <Progress />
    </Suspense>
  );
}
function Progress() {
  const { t, intl } = useI18n();
  // Sunday first (2023-01-01 was a Sunday), in the journal's language.
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2023, 0, 1 + i)).toLocaleDateString(intl, {
      weekday: "short",
      timeZone: "UTC",
    }),
  );
  const { data, error, refresh } = useApi<{
    rules: Routine[];
    checks: RoutineCheck[];
    today: string;
  }>("/api/workspace/progress");
  const [date, setDate] = useState(""),
    [open, setOpen] = useState(false),
    [title, setTitle] = useState(""),
    [stage, setStage] = useState(STAGES[0]!),
    [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  const selected = date || data?.today || "",
    rules = data ? scheduledRules(data.rules, selected) : [],
    score = data ? progressScore(data.rules, data.checks, selected) : null;
  const days = data
    ? Array.from({ length: 91 }, (_, i) => {
        const d = new Date(`${data.today}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 90 + i);
        const key = d.toISOString().slice(0, 10);
        return { date: key, ...progressScore(data.rules, data.checks, key) };
      })
    : [];
  async function act(body: unknown, method: "POST" | "DELETE" = "POST") {
    setBusy(true);
    try {
      await postJson("/api/workspace/progress", body, method);
      setFailure("");
      refresh();
      return true;
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t("Could not save."));
      return false;
    } finally {
      setBusy(false);
    }
  }
  // Loading: not the empty "no routines" states, which would read as your answer.
  if (!data && !error)
    return (
      <div>
        <FilterBar title={t("Progress")} />
        <div className="space-y-4 p-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  return (
    <div>
      <FilterBar
        title={t("Progress")}
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            {t("Add routine")}
          </Button>
        }
      />
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          {t(
            "Build a repeatable trading day. Routines are tracked independently of trade filters and profit.",
          )}
        </p>
        {(error || failure) && (
          <p role="alert" className="text-sm text-destructive">
            {error || failure}
          </p>
        )}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-6 py-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div>
                <p className="text-xs text-muted-foreground">{t("Daily completion")}</p>
                <p className="text-4xl font-semibold">
                  {score?.score == null ? "-" : `${Math.round(score.score * 100)}%`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("{completed} of {total} scheduled routines", {
                    completed: score?.completed ?? 0,
                    total: score?.total ?? 0,
                  })}
                </p>
              </div>
              <Field label={t("Review date")}>
                <DatePicker
                  label={t("Progress date")}
                  value={selected}
                  max={data?.today}
                  onValueChange={setDate}
                />
              </Field>
            </div>
            <ReviewExport
              document={{
                title: t("Routine review · {date}", { date: selected }),
                lines: [
                  t("Completed: {completed}/{total}", {
                    completed: score?.completed ?? 0,
                    total: score?.total ?? 0,
                  }),
                  ...rules.map(
                    (r) =>
                      `${data?.checks.some((c) => c.date === selected && c.ruleId === r.id && c.done) ? t("[done]") : "[ ]"} ${t(r.stage)}: ${r.title}`,
                  ),
                ],
              }}
            />
          </CardContent>
        </Card>
        <div className="grid gap-4 xl:grid-cols-3">
          {STAGES.map((s) => (
            <Card key={s}>
              <CardHeader>
                <CardTitle>{t(s)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rules
                  .filter((r) => r.stage === s)
                  .map((r) => (
                    <div key={r.id} className="flex items-start justify-between gap-2">
                      <label className="flex items-start gap-3 text-sm">
                        <Checkbox
                          className="mt-1"
                          checked={
                            data?.checks.some(
                              (c) => c.ruleId === r.id && c.date === selected && c.done,
                            ) ?? false
                          }
                          disabled={busy || selected > (data?.today ?? "")}
                          onCheckedChange={(checked) =>
                            void act({ ruleId: r.id, date: selected, done: checked === true })
                          }
                        />
                        {r.title}
                      </label>
                      {!r.archivedAt && (
                        <button
                          className="text-xs text-muted-foreground underline"
                          onClick={() => {
                            if (
                              confirm(
                                t("Archive “{title}”? Previous days are preserved.", {
                                  title: r.title,
                                }),
                              )
                            )
                              void act({ id: r.id }, "DELETE");
                          }}
                        >
                          {t("Archive")}
                        </button>
                      )}
                    </div>
                  ))}
                {!rules.some((r) => r.stage === s) && (
                  <p className="text-xs text-muted-foreground">{t("No routines scheduled.")}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("Last 13 weeks")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto">
              {days.map((d) => (
                <HoverHint
                  key={d.date}
                  heading={d.date}
                  content={t("{completed} of {total} routines completed", {
                    completed: d.completed,
                    total: d.total,
                  })}
                >
                  <button
                    key={d.date}
                    aria-label={t("{date}: {completed}/{total} complete", {
                      date: d.date,
                      completed: d.completed,
                      total: d.total,
                    })}
                    onClick={() => setDate(d.date)}
                    className={`min-h-7 min-w-7 rounded border ${selected === d.date ? "border-foreground" : "border-transparent"}`}
                    style={{
                      background:
                        d.score === null
                          ? "var(--muted)"
                          : `color-mix(in srgb, var(--brand) ${15 + d.score * 75}%, var(--card))`,
                    }}
                  />
                </HoverHint>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t(
                "Brighter squares mean a higher completion rate. Grey means no scheduled routines. Click a day to review it. New routines start today.",
              )}
            </p>
          </CardContent>
        </Card>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("Add a daily routine")}</DialogTitle>
            </DialogHeader>
            <Field label={t("Routine")}>
              <input
                className={fieldClass}
                value={title}
                placeholder={t("Review the economic calendar")}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label={t("When")}>
              <OptionSelect
                className={fieldClass}
                value={stage}
                onValueChange={(next) => setStage(next)}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {t(s)}
                  </option>
                ))}
              </OptionSelect>
            </Field>
            <div className="flex flex-wrap gap-3">
              {weekdayNames.map((day, i) => (
                <label key={i} className="flex items-center gap-1 text-xs">
                  <Checkbox
                    checked={weekdays.includes(i)}
                    onCheckedChange={(checked) =>
                      setWeekdays(
                        checked === true ? [...weekdays, i] : weekdays.filter((n) => n !== i),
                      )
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
            {failure && (
              <p role="alert" className="text-xs text-destructive">
                {failure}
              </p>
            )}
            <Button
              disabled={!title.trim() || !weekdays.length || busy}
              onClick={async () => {
                if (await act({ title, stage, weekdays })) {
                  setOpen(false);
                  setTitle("");
                }
              }}
            >
              {t("Add routine")}
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
