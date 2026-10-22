"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { AuditReport } from "@/lib/video-intelligence";
import { useApi } from "@/lib/use-api";
import { useI18n } from "@/components/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** The five steps from a video to a number, in order. */
const STEPS: [string, string][] = [
  [
    "1. The video",
    "Its transcript (captions or one you pasted) or, without one, its summary. Nothing else about the video is read.",
  ],
  [
    "2. The claims",
    "Your AI provider lists each checkable statement with a verbatim quote. The journal then looks the quote up in the transcript itself: verified, approximate or not found. A video without a transcript gives its summary's scenarios and setups, marked as such, with no quote. This is the only step that uses AI.",
  ],
  [
    "3. The market",
    "The instrument is matched to one of your enabled sources (never guessed across asset classes). Closed candles from before the video to after its horizon are downloaded and stored, with the source, symbol, candle size and time read.",
  ],
  [
    "4. The evaluation",
    "Plain code, no AI: from the stored candles it finds the reference price (the last close before publication), then which came first after it, the target or the invalidation, inside the horizon. A setup with an entry, a stop and a target is also traded once under fixed rules. The same claim on the same candles always gives the same result.",
  ],
  [
    "5. The statistics",
    "Outcomes are counted per analyst, instrument, direction, kind of claim and market regime, with 95% intervals, and each group is compared with its mirror: the same claims bet the other way.",
  ],
];

/** Each number, how it is computed and how to read it. */
const METRICS: [string, string, string][] = [
  [
    "Target hit rate",
    "Targets hit inside the horizon ÷ claims settled (target hit, invalidated, expired or hit late). Pending, untriggered, ambiguous and unevaluable claims are left out, never counted as misses.",
    "The share of finished calls that reached their target in time. The interval is where the true rate likely lies given how few claims there are.",
  ],
  [
    "95% interval (Wilson)",
    "A range computed from the count of hits and the sample size; it narrows as claims accumulate.",
    "If two analysts' intervals overlap a lot, the data cannot tell them apart.",
  ],
  [
    "Direction right at horizon",
    "The close of the last candle inside the horizon against the reference price (moves under 0.05% are flat), among claims whose horizon ended.",
    "Whether the analyst read the direction, regardless of their target and stop.",
  ],
  [
    "Right but missed",
    "Direction right at the horizon's end, but the invalidation came first or the target was never reached.",
    "Right idea, wrong levels or timing.",
  ],
  [
    "Mirror hit rate",
    "The same claims with the opposite direction and every level the same distance away, evaluated on the same candles.",
    "What betting against the analyst scored. Close to the analyst's rate means no evidence of skill.",
  ],
  [
    "p-value (sign test)",
    "On claims where only one side won, how likely a split at least this uneven would be if each claim were a coin flip.",
    "Under 5%: unlikely to be luck. With many analysts compared, expect about one in twenty to pass by chance.",
  ],
  [
    "MFE / MAE",
    "The best and worst move from the reference price inside the horizon, as a percentage.",
    "A target hit after a deep MAE was hard to hold.",
  ],
  [
    "Brier score",
    "Average of (stated probability − outcome)², only for probabilities the analyst stated.",
    "0 is perfect; always saying 50% scores 0.25.",
  ],
  [
    "Expectancy, win rate, R",
    "From the simulated trades of level C setups only, after commission and slippage. R is the result over the stop's distance.",
    "Hypothetical results of the stated rules, not the analyst's own trading record.",
  ],
];

/** How the results are tested, and what each test shows. */
const TESTS: [string, string][] = [
  [
    "Hand-made cases",
    "Every outcome (target hit, invalidated, ambiguous, pending, expired, late, untriggered) on candles built so the right answer is known.",
  ],
  [
    "Real candles",
    "Bitcoin's hourly candles from October 2026 with results worked out separately, by another program: reference, target times and the setup's fills match to the decimal.",
  ],
  [
    "3,000 random markets",
    "Every evaluation compared with a second, independent implementation of the rules; they always agree.",
  ],
  [
    "No look-ahead",
    "Removing every candle after the deciding one never changes an outcome, and one candle fewer always leaves it pending.",
  ],
  [
    "No bias",
    "A claim and its mirror on a mirrored market always get the same outcome; multiplying all prices by any number changes nothing; higher costs never improve a trade.",
  ],
  [
    "The statistics",
    "On random markets, analysts who guess are flagged as better than chance under 10% of the time (5% expected), while an analyst who knows the future is flagged over 80% of the time. The 95% intervals contain the true rate about 95% of the time.",
  ],
  [
    "Reproducibility",
    "The audit below computes every stored result again from the stored candles and compares it, field by field.",
  ],
];

export function Methodology() {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const audit = useApi<AuditReport>(url);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("Where the numbers come from")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 md:grid-cols-5">
            {STEPS.map(([title, text]) => (
              <li key={title} className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{t(title)}</div>
                <p className="mt-1 text-muted-foreground">{t(text)}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-muted-foreground">
            {t(
              "Every claim's page shows this path for that claim: the quote, the source and candles read, and the candles that decided it.",
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("A worked example")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            {t(
              "A video published on 1 October at 12:00 says bitcoin rallies to 87,000, invalid below 80,000, on the 4-hour chart. No horizon is said, so the system uses ten days (to 11 October 12:00), labelled on the claim.",
            )}
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              {t(
                "Reference: the 11:00 candle closed at 83,905.76, the last close before publication.",
              )}
            </li>
            <li>
              {t(
                "From the 12:00 candle on, the first candle whose high reaches 87,000 is the 2 October 12:00 candle; no candle had reached 80,000 before it.",
              )}
            </li>
            <li>{t("Outcome: target hit, 1 day after publication.")}</li>
            <li>
              {t(
                "Its mirror, a short to 80,921.57 (as far below the reference as 87,000 is above it) invalid above 88,002.21, also reached its target inside the horizon, on 8 October at 15:00. Both sides won, so this claim counts for neither in the comparison with chance: only claims where one side won and the other did not can show skill.",
              )}
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("What each number means")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Number")}</TableHead>
                <TableHead>{t("How it is computed")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {METRICS.map(([name, how, read]) => (
                <TableRow key={name}>
                  <TableCell className="w-48 align-top font-medium">{t(name)}</TableCell>
                  <TableCell className="whitespace-normal align-top">
                    <p className="text-muted-foreground">{t(how)}</p>
                    <p className="mt-1">
                      <span className="font-medium">{t("How to read it")}:</span> {t(read)}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("How the results are tested")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm">
            {TESTS.map(([name, text]) => (
              <li key={name}>
                <span className="font-medium">{t(name)}:</span>{" "}
                <span className="text-muted-foreground">{t(text)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={audit.loading}
                onClick={() => setUrl(`/api/video-intelligence/audit?at=${Date.now()}`)}
              >
                <ShieldCheck /> {t("Check every stored result now")}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("Recomputes each evaluation from its stored candles; nothing is downloaded.")}
              </span>
            </div>
            {audit.error && (
              <p role="alert" className="text-sm text-destructive">
                {audit.error}
              </p>
            )}
            {audit.data && (
              <div className="space-y-1 text-sm" role="status">
                <p className="font-medium">
                  {audit.data.mismatched.length
                    ? t("{bad} of {checked} results could not be reproduced.", {
                        bad: audit.data.mismatched.length,
                        checked: audit.data.checked,
                      })
                    : t("All {checked} results were reproduced exactly from the stored candles.", {
                        checked: audit.data.checked,
                      })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Not checked: {none} claims without candles (unevaluable) and {old} judged by an older evaluator (they are evaluated again in the background).",
                    { none: audit.data.withoutMarket, old: audit.data.olderVersion },
                  )}
                </p>
                {audit.data.mismatched.map((m) => (
                  <p key={m.claimId} className="text-xs">
                    <Link
                      className="underline"
                      href={`/video-intelligence/${m.videoId}#claim-${m.claimId}`}
                    >
                      {m.statement}
                    </Link>{" "}
                    · {m.fields.map((f) => t(f)).join(", ")}
                  </p>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Limits to keep in mind")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              {t(
                "The results describe the videos you followed and stored, not the analyst's whole record.",
              )}
            </li>
            <li>
              {t(
                "A claim is only as good as its reading: check the quote on its page, especially for inferred claims.",
              )}
            </li>
            <li>
              {t(
                "Candles do not show the order of prices inside them: when a target and an invalidation share a candle, the claim is ambiguous rather than a win.",
              )}
            </li>
            <li>
              {t(
                "Under 20 settled claims, rates are shown with a small-sample warning and should not be compared.",
              )}
            </li>
            <li>
              {t(
                "Comparing many analysts, about one in twenty will look better than chance by luck alone.",
              )}
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
