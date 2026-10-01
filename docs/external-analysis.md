# External analysis

**External analysis** (sidebar) follows the YouTube channels whose market analysis you watch.
Every day the journal looks for their new videos and the AI summarises each one as notes you
can act on. On a journal day, the **External opinion** card shows the day's summaries so you
can put them in the day note next to your own analysis.

## Following a channel

Paste the channel's `@handle`, its link (`youtube.com/@…`, `/channel/UC…`, `/c/…`, `/user/…`),
its channel id, or a link to one of its videos, and select **Follow**. The journal reads the
channel's public feed at once (no YouTube account or API key is used) and summarises its
newest video from the last few days. The feed's other videos are listed as **Not summarised**,
so following a busy channel does not summarise a week of videos at once (if that first read
fails, the first one that works does the same); **Summarise now** does one by hand. **Daily** switches a channel's daily check off without forgetting it; the bin
stops following it and removes its summaries. At most 30 channels.

## The daily check

At the time you choose (journal timezone; 08:00 by default) the journal reads every followed
channel's feed and summarises each new video, one at a time. If the server was off at that
time, the check runs when it is next up that day; if another check (**Check now**, a channel
just followed) is running at that time, it runs a quarter of an hour later. **Check now** runs
it at once.

- **Captions.** A video is read from its captions (the author's in English or Spanish first,
  else YouTube's automatic ones), with time marks every half minute. Automatic captions can
  take a few hours to appear after upload, so a video without them is tried again every two
  hours for two days, then marked **No transcript**.
- **No captions.** Paste the transcript (on YouTube: … → Show transcript) with **Paste
  transcript**. With Google Gemini as the AI provider, a video without captions is watched by
  Gemini instead (this uses many more tokens than a transcript).
- **Skipped** by themselves: videos older than the age you set when first seen (3 days by
  default), videos shorter than the length you set (Shorts; 3 minutes by default), and streams
  that have not aired yet (tried again every two hours, and skipped if they still have not
  aired two days after they were listed). **Summarise now** does any of them.
- **Failures.** A failed summary is retried once an hour later, then waits for you (time spent
  waiting for captions does not count). **Summarise now** and **Paste transcript** are
  refused while the video is being summarised; try again when it is done.
- **Notifications.** A notification when a summary is ready, through the browsers and
  webhook set up on the Alerts page, if its **YouTube analyses** row is on there; each channel
  can be muted on its own ([alerts.md](alerts.md)). The page's former **Notify me** switch
  (`notify` in the settings) only decides until the Alerts page's choices are saved.

The transcript is sent to your AI provider to be summarised; nothing else leaves the server.
YouTube is reached through its public feed and the player endpoint its apps use (the web
page's caption links need a browser-only token). YouTube changes these from time to time: a
failure is shown on the channel or the video as it happened, never replaced by a guess.

## The summary

Written in the language you choose (English by default), from what the author says only:

- **Overview** and overall **bias**, the instruments discussed and the timeframe.
- **Main scenario**: what the author thinks most likely, its trigger, targets, invalidation
  and likelihood as they put it, and the **reasons** they give for it.
- **Secondary scenario** and the reasons that would make it right.
- **Their open trades**: positions the author says they hold, with entry, stop loss and take
  profits.
- **When to go long or short**: the moments they call good for a trade, with the condition,
  entry zone, stop loss and take profits.
- **Key levels** they name, and **caveats** (their warnings, and what the video leaves
  unclear).

Prices are the author's, as numbers; anything not said stays empty. A long transcript (over
about two hours of speech) is first reduced to notes part by part, keeping every price and
condition, then summarised.

## In the journal

- **On a journal day**, the External opinion card lists the summaries published that day or
  the evening before, with the author's bias and scenarios. **Add to note** appends the
  summary to the day note as an "External opinion" section (a link to the video, the
  scenarios with their reasons, the trades and the levels), after what you wrote.
- **From External analysis**, **Add to journal day** does the same for any day. A note that
  already links the video is left as it is.
- **The AI chat** reads them with its `external_opinions` tool, as other people's opinions,
  never as yours, and as untrusted text: instructions inside a video are never followed.

## Storage and code

Channels and videos live in their own tables (`external_channels`, `external_videos`), created
on first use; settings in the settings table. The code is `lib/youtube.ts` (reading YouTube's
pages, feed and captions), `lib/external-summary.ts` (the summary's shape, its hand-checked
reading and the note section), `server/external-analysis/*` (fetching, storage, the pipeline
and the daily scheduler, started from `instrumentation-node.ts`; `JOURNAL_EXTERNAL_ANALYSIS=off`
stops it), `app/api/external/**`, `app/external/page.tsx`, and the components
`external-summary-view.tsx` and `external-opinions.tsx`.

## API

- `GET /api/external` (settings, channels, the latest videos, whether a check is running);
  `PUT /api/external` saves `{ checkTime, maxAgeDays, minMinutes, language, notify }`.
- `POST /api/external/channels` `{ input }` follows a channel; `PATCH` `{ id, enabled }`;
  `DELETE` `{ id }`.
- `POST /api/external/check` `{ channelId? }` runs a check in the background.
- `GET /api/external/videos/{id}`; `POST` with `{ action: "summarize" }`,
  `{ action: "transcript", text }` (both 409 while the video is being summarised) or
  `{ action: "add-to-day", date }`.
- `GET /api/external/day?date=` lists a journal day's external opinions.

## Verification

`pnpm exec vitest run apps/web/tests/youtube.test.ts apps/web/tests/external-analysis.test.ts
apps/web/tests/external-summary.test.ts` covers reading channel inputs, feeds and captions,
the pipeline against a fake YouTube and AI provider (captions, waiting and giving up, pasted
transcripts, Shorts, streams, failures, notifications, Gemini watching, languages, the daily
scheduler), the journal day and the note section. `LIVE_YOUTUBE=1 pnpm exec vitest run
apps/web/tests/youtube.live.test.ts` checks the real YouTube: a handle, its feed and a
transcript.
