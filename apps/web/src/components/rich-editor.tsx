"use client";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { CandlestickChart, ChevronDown, FileText, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { fieldClass } from "@/components/filter-fields";
import { postJson, useApi } from "@/lib/use-api";
import { formatInlineSelection, remarkRepairSpacedEmphasis } from "@/lib/note-formatting";
import { tradeLinkLabel, tradeMarkdownLink, type LinkableTrade } from "@/lib/trade-links";
import {
  analysisEditPath,
  analysisEmbedFromSrc,
  analysisLabel,
  analysisMarkdown,
  snapshotMarkdown,
  snapshotViewPath,
  type ChartAnalysisSummary,
} from "@/lib/chart-analysis";
import { useI18n } from "./i18n";
/** The host of an image that would load from another site, or null for one of ours. */
function externalHost(src: string | undefined): string | null {
  if (!src || typeof window === "undefined") return null;
  try {
    const url = new URL(src, window.location.href);
    if (url.protocol === "data:" || url.protocol === "blob:") return null;
    return url.origin === window.location.origin ? null : url.host;
  } catch {
    return null;
  }
}

export function Markdown({
  children,
  externalImages = "load",
}: {
  children: string;
  /** "ask" for text the AI wrote: an image from another site waits for a click, as text it
   *  read (a video summary, a note) could tell it to put journal data in an image URL. */
  externalImages?: "load" | "ask";
}) {
  return (
    <div className="journal-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkRepairSpacedEmphasis]}
        components={{
          table: ({ children }) => (
            <div className="max-w-full overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
          a: ({ href, children }) =>
            href?.startsWith("/trades/") || href?.startsWith("/charts") ? (
              <Link href={href}>{children}</Link>
            ) : (
              <a href={href}>{children}</a>
            ),
          img: ({ src, alt }) => (
            <MarkdownImage
              src={typeof src === "string" ? src : undefined}
              alt={alt ?? ""}
              ask={externalImages === "ask"}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
/**
 * Images render inline. A saved chart analysis becomes a figure that opens the chart for
 * editing. Spans keep it valid inside the paragraph Markdown wraps images in.
 */
function MarkdownImage({ src, alt, ask }: { src?: string; alt: string; ask: boolean }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(false);
  const embed = analysisEmbedFromSrc(src);
  const host = ask && !shown ? externalHost(src) : null;
  if (host)
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground underline"
        onClick={() => setShown(true)}
      >
        {alt
          ? t("Show image from {host} ({alt})", { host, alt })
          : t("Show image from {host}", { host })}
      </button>
    );
  if (!embed) return <img src={src} alt={alt} loading="lazy" className="max-w-full rounded-md" />;
  const { id, day } = embed;
  const caption = alt.replace(/ chart analysis$/, "") || t("Chart analysis");
  // A day snapshot opens that day's version; a live embed opens the analysis to edit.
  const href = day ? snapshotViewPath(id, day) : analysisEditPath(id);
  return (
    <span className="journal-analysis-embed my-2 block overflow-hidden rounded-lg border bg-card">
      {failed ? (
        <span className="block p-4 text-sm text-muted-foreground">
          {t(
            "This chart snapshot is unavailable. The analysis may have been deleted or saved without an image.",
          )}
        </span>
      ) : (
        <Link href={href} className="block" aria-label={t("Open {caption} in Charts", { caption })}>
          <img
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setFailed(true)}
            className="block h-auto w-full"
          />
        </Link>
      )}
      <span className="flex items-center justify-between gap-2 border-t px-3 py-1.5 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <CandlestickChart aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{caption}</span>
        </span>
        <span className="flex shrink-0 gap-3">
          {day && (
            <Link href={analysisEditPath(id)} className="underline">
              {t("Live chart")}
            </Link>
          )}
          <Link href={href} className="underline">
            {day ? t("As of {day}", { day }) : t("Open in Charts")}
          </Link>
        </span>
      </span>
    </span>
  );
}
// Built-in templates: the English is the lookup key; the name and the inserted text read in
// the journal's language (the inserted text is saved in the note as it reads).
const BUILT_INS = [
  {
    id: "pre",
    name: "Pre-market plan",
    content:
      "## Market context\n\n## Setups to watch\n\n## Risk limits\n- [ ] Confirm daily risk limit\n- [ ] Check scheduled events\n\n## My intention\n",
  },
  {
    id: "review",
    name: "Trade review",
    content: "## Setup and thesis\n\n## Execution\n\n## What worked\n\n## What I will change\n",
  },
  {
    id: "weekly",
    name: "Weekly review",
    content:
      "## Wins this week\n\n## Repeated mistakes\n\n## Rules I followed\n\n## One improvement for next week\n",
  },
];
export interface RichEditorHandle {
  focus(): void;
}
export function RichEditor({
  value,
  onChange,
  placeholder,
  defaultMode,
  mode,
  onModeChange,
  showModeToggle = true,
  editorRef,
  analysisDay,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  defaultMode?: "preview" | "edit";
  mode?: "preview" | "edit";
  onModeChange?: (mode: "preview" | "edit") => void;
  showModeToggle?: boolean;
  editorRef?: Ref<RichEditorHandle>;
  /** Journal day a new chart analysis started from this editor should belong to. */
  analysisDay?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null),
    [localPreview, setLocalPreview] = useState(() =>
      defaultMode ? defaultMode === "preview" : Boolean(value.trim()),
    ),
    [error, setError] = useState("");
  const preview = mode ? mode === "preview" : localPreview;
  // The latest text, for work that finishes after an await: typing, an AI recap or a voice
  // memo can change the note meanwhile, and a stale `value` would write over them.
  const latest = useRef(value);
  latest.current = value;
  const setPreview = (next: boolean) => {
    setLocalPreview(next);
    onModeChange?.(next ? "preview" : "edit");
  };
  useImperativeHandle(editorRef, () => ({
    focus() {
      setPreview(false);
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.setSelectionRange(value.length, value.length);
      });
    },
  }));
  const { data, refresh } = useApi<{ templates: { id: string; name: string; content: string }[] }>(
    "/api/workspace/templates",
  );
  const [linkOpen, setLinkOpen] = useState(false),
    [search, setSearch] = useState("");
  const {
    data: trades,
    error: tradeError,
    loading: tradesLoading,
  } = useApi<{
    trades: LinkableTrade[];
    hasMore: boolean;
  }>(linkOpen ? `/api/trades/lookup?q=${encodeURIComponent(search)}` : null);
  const [chartsOpen, setChartsOpen] = useState(false);
  const { data: analyses, error: analysesError } = useApi<{ analyses: ChartAnalysisSummary[] }>(
    chartsOpen ? "/api/analyses" : null,
  );
  function insert(before: string, after = "") {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length,
      end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end));
    setPreview(false);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(start + before.length, end + before.length);
    });
  }
  const [chartError, setChartError] = useState("");
  /**
   * Insert at the cursor (or the end), then preview so the embedded chart shows. A day's
   * note gets that day's snapshot (pinned now if the day has none), so it keeps showing the
   * analysis as it was; other notes embed the live analysis.
   */
  async function insertChart(analysis: ChartAnalysisSummary) {
    const at = preview ? value.length : (ref.current?.selectionEnd ?? value.length);
    setChartError("");
    let markdown = analysisMarkdown(analysis);
    if (analysisDay) {
      try {
        await postJson(
          `/api/analyses/${encodeURIComponent(analysis.id)}/snapshots/${analysisDay}`,
          { action: "ensure" },
        );
        markdown = snapshotMarkdown(analysis, analysisDay);
      } catch (cause) {
        setChartError(cause instanceof Error ? cause.message : t("Could not add the chart."));
        return;
      }
    }
    const now = latest.current;
    // Keep the chosen spot while the text up to it is unchanged; otherwise the end is the
    // only place that cannot split what was written meanwhile.
    const spot = now.slice(0, at) === value.slice(0, at) ? at : now.length;
    const before = now.slice(0, spot);
    const embed = `${before && !before.endsWith("\n") ? "\n\n" : before ? "\n" : ""}${markdown}\n`;
    onChange(before + embed + now.slice(spot));
    setPreview(true);
  }
  function formatInline(marker: "*" | "**") {
    const next = formatInlineSelection(
      value,
      ref.current?.selectionStart ?? value.length,
      ref.current?.selectionEnd ?? value.length,
      marker,
    );
    onChange(next.value);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        {showModeToggle && (
          <Button type="button" variant="outline" size="sm" onClick={() => setPreview(!preview)}>
            {preview ? t("Edit") : t("Preview")}
          </Button>
        )}
        {!preview && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatInline("**")}
              aria-label={t("Bold")}
            >
              B
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatInline("*")}
              aria-label={t("Italic")}
            >
              <i>I</i>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insert("\n## ")}
              aria-label={t("Heading")}
            >
              H2
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insert("\n- ")}
              aria-label={t("Bullet list")}
            >
              {t("List")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insert("\n- [ ] ")}
              aria-label={t("Checklist")}
            >
              {t("Checklist")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setLinkOpen(!linkOpen)}>
              {t("Link trade")}
            </Button>
            <DropdownMenu open={chartsOpen} onOpenChange={setChartsOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={t("Insert chart analysis")}
                  className="gap-1.5"
                >
                  <CandlestickChart className="size-3.5" />
                  {t("Chart")}
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                aria-label={t("Chart analyses")}
                className="max-h-80 w-72 overflow-y-auto"
              >
                <DropdownMenuItem asChild>
                  <Link href={analysisDay ? `/charts?day=${analysisDay}` : "/charts"}>
                    <Plus aria-hidden="true" className="size-3.5 shrink-0" />
                    {t("New chart analysis…")}
                  </Link>
                </DropdownMenuItem>
                {chartError && (
                  <p role="alert" className="px-2 py-1.5 text-xs text-destructive">
                    {chartError}
                  </p>
                )}
                {analysesError && (
                  <p role="alert" className="px-2 py-1.5 text-xs text-destructive">
                    {analysesError}
                  </p>
                )}
                {!analyses && !analysesError && (
                  <p role="status" className="px-2 py-1.5 text-xs text-muted-foreground">
                    {t("Loading analyses…")}
                  </p>
                )}
                {analyses?.analyses.map((analysis) => (
                  <DropdownMenuItem key={analysis.id} onSelect={() => void insertChart(analysis)}>
                    <CandlestickChart
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate">{analysisLabel(analysis)}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {analysis.dayDate ?? analysis.updatedAt.slice(0, 10)}
                    </span>
                  </DropdownMenuItem>
                ))}
                {analyses?.analyses.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    {t("No saved analyses yet.")}
                  </p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={t("Insert note template")}
                  className="gap-2 rounded-lg"
                >
                  {t("Insert template…")}
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" aria-label={t("Note templates")}>
                {[
                  ...BUILT_INS.map((b) => ({ ...b, name: t(b.name), content: t(b.content) })),
                  ...(data?.templates ?? []),
                ].map((template) => (
                  <DropdownMenuItem
                    key={template.id}
                    onSelect={() => onChange(value + (value ? "\n\n" : "") + template.content)}
                  >
                    <FileText
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    {template.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!value}
              onClick={async () => {
                const name = prompt(t("Name this note template"));
                if (!name) return;
                try {
                  await postJson("/api/workspace/templates", { name, content: value });
                  refresh();
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              {t("Save template")}
            </Button>
          </>
        )}
      </div>
      {linkOpen && !preview && (
        <div className="space-y-2 rounded-md border p-2">
          <input
            aria-label={t("Find trade by symbol, date or account")}
            placeholder={t("Search symbol, date or account")}
            className={fieldClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-40 overflow-y-auto">
            {tradesLoading && (
              <p role="status" className="text-xs text-muted-foreground">
                {t("Loading trades…")}
              </p>
            )}
            {tradeError && (
              <p role="alert" className="text-xs text-destructive">
                {tradeError}
              </p>
            )}
            {!tradesLoading &&
              !tradeError &&
              trades?.trades.map((trade) => (
                <button
                  key={trade.key}
                  type="button"
                  className="block w-full rounded p-1 text-left text-xs hover:bg-accent"
                  onClick={() => {
                    onChange(value + `\n${tradeMarkdownLink(trade)}\n`);
                    setLinkOpen(false);
                    setPreview(true);
                  }}
                >
                  {tradeLinkLabel(trade)}
                </button>
              ))}
            {!tradesLoading && !tradeError && trades?.trades.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("No matching trades.")}</p>
            )}
            {!tradesLoading && !tradeError && trades?.hasMore && (
              <p className="text-xs text-muted-foreground">
                {t(
                  "Showing the latest 50 matches. Search by date or account to find older trades.",
                )}
              </p>
            )}
          </div>
        </div>
      )}
      {preview ? (
        <div className="min-h-40 rounded-md border p-3">
          <Markdown>{value || t("Nothing written yet.")}</Markdown>
        </div>
      ) : (
        <textarea
          ref={ref}
          aria-label={t("Review notes")}
          className={`${fieldClass} min-h-48 resize-y font-mono text-[13px]`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? t("Write your review…")}
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
