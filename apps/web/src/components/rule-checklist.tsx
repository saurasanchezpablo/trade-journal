"use client";
import { OptionSelect } from "@/components/ui/option-select";

import { useEffect, useRef, useState } from "react";
import { useApi, postJson } from "@/lib/use-api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { fieldClass } from "@/components/filter-fields";
import { Button } from "@/components/ui/button";
import { AiNotice } from "@/components/ai-notice";
import { tradeSnapshot } from "@/lib/trade-snapshot";
import { Sparkles } from "lucide-react";

type Verdict = "followed" | "broken" | "unclear";
interface AiCheck {
  summary: string;
  checks: { rule: string; verdict: Verdict; reason: string }[];
}
const VERDICT_LABEL: Record<Verdict, string> = {
  followed: "followed",
  broken: "broken",
  unclear: "can't tell",
};
export function RuleChecklist({
  tradeKey,
  playbookId,
}: {
  tradeKey: string;
  playbookId: string | null;
}) {
  const url = `/api/trades/${encodeURIComponent(tradeKey)}/rules`;
  const { data, error, refresh } = useApi<{
      name: string | null;
      rules: { rule: string; followed: boolean | null }[];
    }>(`${url}?playbook=${playbookId ?? ""}`),
    [failure, setFailure] = useState(""),
    [ai, setAi] = useState<AiCheck | null>(null),
    [aiBusy, setAiBusy] = useState(false),
    [aiError, setAiError] = useState<string | null>(null);
  const save = async (rule: string, followed: boolean | null) => {
    try {
      await postJson(url, { rule, followed });
      refresh();
      setFailure("");
    } catch (e) {
      setFailure(String(e));
    }
  };
  // The AI check judges the rules of the playbook it was asked with: another playbook
  // (or trade) drops it, and a check that answers after the change is not shown.
  const scope = JSON.stringify([tradeKey, playbookId]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    setAi(null);
    setAiError(null);
    setAiBusy(false);
  }, [scope]);
  const check = async () => {
    const asked = scope;
    setAiBusy(true);
    setAiError(null);
    try {
      const chartImage = tradeSnapshot(tradeKey);
      const result = await postJson<AiCheck>("/api/ai/playbook-check", {
        key: tradeKey,
        ...(chartImage ? { chartImage } : {}),
      });
      if (currentScope.current === asked) setAi(result);
    } catch (e) {
      if (currentScope.current === asked)
        setAiError(e instanceof Error ? e.message : "The check failed");
    } finally {
      if (currentScope.current === asked) setAiBusy(false);
    }
  };
  const suggestion = (rule: string) => ai?.checks.find((c) => c.rule === rule);
  // Only verdicts on this playbook's rules can be applied; the server refuses any other.
  const decided =
    ai?.checks.filter((c) => {
      const rule = data?.rules.find((r) => r.rule === c.rule);
      return (
        rule !== undefined &&
        c.verdict !== "unclear" &&
        rule.followed !== (c.verdict === "followed")
      );
    }) ?? [];
  const evaluated = data?.rules.filter((r) => r.followed !== null) ?? [],
    followed = evaluated.filter((r) => r.followed).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategy rule review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data?.name ? (
          <>
            <p className="text-sm font-medium">{data.name}</p>
            <p className="text-xs text-muted-foreground">
              {evaluated.length
                ? `${Math.round((followed / evaluated.length) * 100)}% followed · `
                : ""}
              {evaluated.length}/{data.rules.length} rules assessed
            </p>
            {data.rules.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Add rules to this playbook to review adherence.
              </p>
            )}
            {data.rules.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={aiBusy}
                  onClick={() => void check()}
                >
                  <Sparkles />
                  {aiBusy ? "Checking…" : "Check with AI"}
                </Button>
                {decided.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void (async () => {
                        for (const c of decided) await save(c.rule, c.verdict === "followed");
                      })()
                    }
                  >
                    Apply {decided.length} suggestion{decided.length === 1 ? "" : "s"}
                  </Button>
                )}
              </div>
            )}
            {aiError && (
              <AiNotice
                error={aiError}
                onRetry={() => void check()}
                onDismiss={() => setAiError(null)}
              />
            )}
            {ai?.summary && <p className="text-xs">{ai.summary}</p>}
            {data.rules.map((r) => (
              <div key={r.rule} className="space-y-1 border-t pt-2">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>{r.rule}</span>
                  <OptionSelect
                    aria-label={r.rule}
                    className={`${fieldClass} !w-32 shrink-0`}
                    value={r.followed === null ? "unreviewed" : String(r.followed)}
                    onValueChange={(next) =>
                      void save(r.rule, next === "unreviewed" ? null : next === "true")
                    }
                  >
                    <option value="unreviewed">Not assessed</option>
                    <option value="true">Followed</option>
                    <option value="false">Broken</option>
                  </OptionSelect>
                </label>
                {suggestion(r.rule) && (
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">
                        AI: {VERDICT_LABEL[suggestion(r.rule)!.verdict]}.
                      </span>{" "}
                      {suggestion(r.rule)!.reason}
                    </span>
                    {suggestion(r.rule)!.verdict !== "unclear" &&
                      r.followed !== (suggestion(r.rule)!.verdict === "followed") && (
                        <button
                          type="button"
                          className="underline"
                          onClick={() =>
                            void save(r.rule, suggestion(r.rule)!.verdict === "followed")
                          }
                        >
                          Apply
                        </button>
                      )}
                  </p>
                )}
              </div>
            ))}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Assign a playbook to check its rules for this trade.
          </p>
        )}
        {(error || failure) && (
          <p role="alert" className="text-xs text-destructive">
            {error || failure}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
