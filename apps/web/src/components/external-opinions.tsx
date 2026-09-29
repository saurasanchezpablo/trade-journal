"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { summaryMarkdown, type ExternalSummary } from "@/lib/external-summary";
import { useApi } from "@/lib/use-api";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { DirectionChip, ExternalSummaryView } from "./external-summary-view";

interface DayVideo {
  videoId: string;
  channelTitle: string;
  title: string;
  url: string;
  publishedAt: string;
  status: string;
  summary: ExternalSummary | null;
  day: string;
}

/**
 * External opinions for a journal day: the summaries of videos from the channels you follow,
 * published that day or the evening before. "Add to note" puts one in the day note as an
 * External opinion section, next to your own analysis.
 */
export function ExternalOpinions({
  date,
  note,
  onAdd,
}: {
  date: string;
  /** The day note as it is now, to see what is already in it. */
  note: string;
  onAdd: (markdown: string) => void;
}) {
  const { data } = useApi<{ videos: DayVideo[] }>(`/api/external/day?date=${date}`);
  const [open, setOpen] = useState<string | null>(null);
  const videos = data?.videos ?? [];
  const summarized = videos.filter((v) => v.summary);
  const pending = videos.length - summarized.length;
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>External opinion</CardTitle>
        <Link href="/external" className="text-xs underline">
          Channels and all summaries
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {!data ? null : summarized.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No external analysis for this day
            {pending
              ? ` yet (${pending} still being summarised or waiting for captions)`
              : ""}.{" "}
            {!videos.length && (
              <>
                Follow YouTube channels under{" "}
                <Link href="/external" className="underline">
                  External analysis
                </Link>{" "}
                to see their summaries here.
              </>
            )}
          </p>
        ) : (
          <ul className="space-y-2" aria-label="External opinions">
            {summarized.map((v) => {
              const added = note.includes(v.url);
              return (
                <li key={v.videoId} className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <DirectionChip direction={v.summary!.bias} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{v.channelTitle}</span>
                      {": "}
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        {v.title}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {v.day === date ? "this day" : "the day before"},{" "}
                      {new Date(v.publishedAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {v.summary!.mainScenario && (
                    <p className="text-xs text-muted-foreground">
                      Main: {v.summary!.mainScenario.title}
                      {v.summary!.secondaryScenario
                        ? ` · Secondary: ${v.summary!.secondaryScenario.title}`
                        : ""}
                    </p>
                  )}
                  {open === v.videoId && <ExternalSummaryView summary={v.summary!} compact />}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setOpen(open === v.videoId ? null : v.videoId)}
                    >
                      {open === v.videoId ? "Hide" : "Show the summary"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={added}
                      onClick={() => onAdd(summaryMarkdown(v.summary!, v))}
                    >
                      {added ? "In the note" : "Add to note"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
