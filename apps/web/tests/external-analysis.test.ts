import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-external-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db, settings, journalDays } = await import("../src/db");
const { readAiRequest } = await import("../src/server/ai-scope");
const { journalTools } = await import("../src/server/ai-agent/tools");
const { setSetting } = await import("../src/server/settings");
const { youtubeTransport } = await import("../src/server/external-analysis/youtube");
const store = await import("../src/server/external-analysis/store");
const { runCheck, checkRunning, WAIT_RETRY_MS } =
  await import("../src/server/external-analysis/process");
const { dailyDue, ExternalScheduler } = await import("../src/server/external-analysis/scheduler");
const channelsRoute = await import("../src/app/api/external/channels/route");
const externalRoute = await import("../src/app/api/external/route");
const videoRoute = await import("../src/app/api/external/videos/[id]/route");
const dayRoute = await import("../src/app/api/external/day/route");
const { anthropicMessage, geminiMessage, script } = await import("./ai-provider-fixtures");

const CHANNEL = "UCN9Nj4tjXbVTLYWN0EKly_Q";
const HOUR = 3_600_000;
const NOW = Date.parse("2026-09-29T12:00:00Z");

/** A channel's videos: id, hours before NOW, and how the player answers for it. */
type Fake = {
  id: string;
  hoursAgo: number;
  title: string;
  captions?: boolean;
  minutes?: number;
  upcoming?: boolean;
};
let videos: Fake[] = [];
const requests: string[] = [];

const feedXml = () =>
  `<?xml version="1.0"?><feed><yt:channelId>${CHANNEL.slice(2)}</yt:channelId><title>Crypto Banter</title>` +
  videos
    .map(
      (v) =>
        `<entry><yt:videoId>${v.id}</yt:videoId><title>${v.title}</title><published>${new Date(NOW - v.hoursAgo * HOUR).toISOString()}</published><media:group><media:description>Levels in the video</media:description></media:group></entry>`,
    )
    .join("") +
  `</feed>`;

const transcriptXml = `<timedtext format="3"><body><p t="1000" d="4000">Bitcoin is holding 64,000 support.</p><p t="40000" d="4000">My main scenario is a push to 70,000 and 72,000, invalid below 61,500.</p><p t="80000" d="4000">If we lose 61,500 we go to 58,000. I am long from 63,200 with a stop at 61,400.</p></body></timedtext>`;

beforeEach(async () => {
  // A check the previous test started in the background (following a channel) finishes first.
  await vi.waitFor(() => expect(checkRunning()).toBe(false), { timeout: 5000 });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv("JOURNAL_PASSWORD", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "fixture-anthropic-key");
  store.client().exec("DELETE FROM external_videos; DELETE FROM external_channels;");
  db.delete(settings).run();
  db.delete(journalDays).run();
  setSetting("timeZone", "UTC");
  requests.length = 0;
  videos = [
    { id: "NEWEST00001", hoursAgo: 2, title: "BTC: the next move", captions: true, minutes: 25 },
    { id: "RECENT00002", hoursAgo: 20, title: "Altcoin buys", captions: true, minutes: 30 },
    { id: "OLDONE00003", hoursAgo: 24 * 10, title: "Old video", captions: true, minutes: 30 },
  ];
  youtubeTransport.fetch = vi.fn(async (url: string, init: RequestInit) => {
    requests.push(url);
    if (url.startsWith("https://www.youtube.com/@"))
      return new Response(
        `<link rel="alternate" type="application/rss+xml" title="RSS" href="https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}">`,
      );
    if (url.includes("feeds/videos.xml")) return new Response(feedXml());
    if (url.includes("youtubei/v1/player")) {
      const id = (JSON.parse(String(init.body)) as { videoId: string }).videoId;
      const video = videos.find((v) => v.id === id);
      return Response.json({
        playabilityStatus: { status: "OK" },
        videoDetails: {
          channelId: CHANNEL,
          title: video?.title ?? "",
          lengthSeconds: String((video?.minutes ?? 20) * 60),
          isUpcoming: video?.upcoming === true,
          shortDescription: "",
        },
        captions: video?.captions
          ? {
              playerCaptionsTracklistRenderer: {
                captionTracks: [
                  {
                    baseUrl: `https://www.youtube.com/api/timedtext?v=${id}`,
                    languageCode: "en",
                    kind: "asr",
                  },
                ],
              },
            }
          : undefined,
      });
    }
    if (url.includes("api/timedtext")) return new Response(transcriptXml);
    return new Response("not found", { status: 404 });
  }) as typeof youtubeTransport.fetch;
});

afterAll(() => {
  db.$client.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

const summary = {
  overview: "Bitcoin holds 64k; the author expects a push higher.",
  bias: "long",
  instruments: ["BTC"],
  timeframe: "days",
  mainScenario: {
    title: "Push to 70k",
    direction: "long",
    instrument: "BTC",
    description: "Holding 64k support leads to 70k and 72k.",
    trigger: "hold 64,000",
    targets: [70000, 72000],
    invalidation: 61500,
    likelihood: "most likely",
  },
  mainReasons: ["64k support holding"],
  secondaryScenario: {
    title: "Loss of 61.5k",
    direction: "short",
    instrument: "BTC",
    description: "Below 61.5k it goes to 58k.",
    trigger: "lose 61,500",
    targets: [58000],
    invalidation: null,
    likelihood: null,
  },
  secondaryReasons: ["A break of the range low"],
  openTrades: [
    {
      instrument: "BTC",
      direction: "long",
      entry: 63200,
      stopLoss: 61400,
      takeProfits: [70000],
      note: "",
    },
  ],
  tradeIdeas: [
    {
      instrument: "BTC",
      direction: "long",
      when: "on a retest of 64k",
      entryLow: 64200,
      entryHigh: 63800,
      stopLoss: 61400,
      takeProfits: [70000, 72000],
      note: "",
    },
  ],
  keyLevels: [{ instrument: "BTC", price: 64000, kind: "support", note: "range low" }],
  caveats: ["Macro news this week"],
};
const deps = { now: () => NOW, deliver: vi.fn(async () => 1) };

async function follow(input = "@CryptoBanterGroup") {
  // The route summarises in the background; the tests run the check themselves.
  const provider = script(() => anthropicMessage(JSON.stringify(summary)));
  const response = await channelsRoute.POST(
    new Request("http://localhost/api/external/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    }),
  );
  return { response, provider };
}

describe("following a channel", () => {
  it("resolves the handle, lists its feed, and queues only its newest recent video", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    try {
      const { response } = await follow();
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.channel).toMatchObject({
        channelId: CHANNEL,
        title: "Crypto Banter",
        enabled: true,
      });
      const byId = Object.fromEntries(
        (body.videos as { videoId: string; status: string; detail: string }[]).map((v) => [
          v.videoId,
          v,
        ]),
      );
      expect(byId.NEWEST00001!.status).toMatch(/new|summarized/);
      expect(byId.RECENT00002).toMatchObject({
        status: "skipped",
        detail: expect.stringMatching(/when the channel was added/),
      });
      expect(byId.OLDONE00003).toMatchObject({
        status: "skipped",
        detail: expect.stringMatching(/Older than 3 days/),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses what is not a YouTube channel, and the same channel twice", async () => {
    const bad = await channelsRoute.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ input: "https://vimeo.com/1" }),
      }),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/Paste a YouTube channel/);
    await follow();
    const again = await (
      await follow(`https://www.youtube.com/channel/${CHANNEL}`)
    ).response.json();
    expect(again.existed).toBe(true);
    expect(store.listChannels()).toHaveLength(1);
  });
});

describe("a new video", () => {
  const add = () => {
    const channel = store.addChannel({ channelId: CHANNEL, title: "Crypto Banter", url: "x" });
    store.markChannelChecked(channel.id, null); // not its first check: every recent video queues
    return channel;
  };

  it("is summarised from its captions into scenarios, trades and levels", async () => {
    add();
    videos = [videos[0]!];
    const provider = script(() => anthropicMessage(JSON.stringify(summary)));
    const report = await runCheck({ deps });
    expect(report).toMatchObject({ channels: 1, newVideos: 1, summarized: 1 });
    const video = store.getVideo("NEWEST00001")!;
    expect(video).toMatchObject({
      status: "summarized",
      source: "captions",
      language: "en",
      lengthSeconds: 1500,
    });
    expect(video.summary?.mainScenario).toMatchObject({
      title: "Push to 70k",
      targets: [70000, 72000],
      invalidation: 61500,
    });
    // The entry zone is put in order.
    expect(video.summary?.tradeIdeas[0]).toMatchObject({ entryLow: 63800, entryHigh: 64200 });
    const asked = JSON.stringify(provider.body(0));
    expect(asked).toContain("[0:01] Bitcoin is holding 64,000 support.");
    expect(asked).toContain('Video: \\"BTC: the next move\\" by Crypto Banter');
    expect(asked).toContain("Write every text field in English");
    // Checked again: nothing new, nothing summarised twice.
    const again = await runCheck({ deps });
    expect(again).toMatchObject({ newVideos: 0, summarized: 0 });
  });

  it("waits for captions, retrying every two hours, and gives up after two days", async () => {
    add();
    videos = [{ ...videos[0]!, captions: false }];
    script();
    await runCheck({ deps });
    let video = store.getVideo("NEWEST00001")!;
    expect(video.status).toBe("waiting");
    expect(Date.parse(video.nextAttemptAt!)).toBe(NOW + WAIT_RETRY_MS);
    // Not due yet: left alone.
    await runCheck({ feeds: false, deps: { ...deps, now: () => NOW + HOUR } });
    expect(store.getVideo("NEWEST00001")!.attempts).toBe(1);
    // Two days on, still nothing: it stops waiting.
    await runCheck({ feeds: false, deps: { ...deps, now: () => NOW + 49 * HOUR } });
    video = store.getVideo("NEWEST00001")!;
    expect(video).toMatchObject({ status: "no_transcript", nextAttemptAt: null });
    expect(video.detail).toMatch(/Paste the transcript/);
  });

  it("is summarised from a pasted transcript", async () => {
    add();
    videos = [{ ...videos[0]!, captions: false }];
    script();
    await runCheck({ deps });
    const provider = script(() => anthropicMessage(JSON.stringify(summary)));
    const pasted = "Pasted words about Bitcoin at 64,000 and a stop at 61,400. ".repeat(10);
    const response = await videoRoute.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ action: "transcript", text: pasted }),
      }),
      { params: Promise.resolve({ id: "NEWEST00001" }) },
    );
    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(store.getVideo("NEWEST00001")!.status).toBe("summarized"));
    expect(store.getVideo("NEWEST00001")!.source).toBe("pasted");
    expect(JSON.stringify(provider.body(0))).toContain("Pasted words about Bitcoin");
  });

  it("skips Shorts and waits for a scheduled stream to air", async () => {
    add();
    videos = [
      { id: "SHORTS00001", hoursAgo: 1, title: "Quick one", captions: true, minutes: 1 },
      { id: "LIVE0000001", hoursAgo: 1, title: "Live at 8pm", upcoming: true },
    ];
    script();
    await runCheck({ deps });
    expect(store.getVideo("SHORTS00001")).toMatchObject({
      status: "skipped",
      detail: expect.stringMatching(/Short/),
    });
    expect(store.getVideo("LIVE0000001")).toMatchObject({
      status: "waiting",
      detail: "Not aired yet.",
    });
  });

  it("retries a failed summary once, then waits for you", async () => {
    add();
    videos = [videos[0]!];
    script(() => anthropicMessage("not json at all"));
    await runCheck({ deps });
    let video = store.getVideo("NEWEST00001")!;
    expect(video).toMatchObject({
      status: "failed",
      detail: expect.stringMatching(/could not read/),
    });
    expect(video.nextAttemptAt).not.toBeNull();
    script(() => anthropicMessage("still not json"));
    await runCheck({ feeds: false, deps: { ...deps, now: () => NOW + 2 * HOUR } });
    video = store.getVideo("NEWEST00001")!;
    expect(video).toMatchObject({ status: "failed", attempts: 2, nextAttemptAt: null });
  });

  it("notifies you when it is ready, if you asked to be", async () => {
    add();
    videos = [videos[0]!];
    store.saveExternalSettings({ ...store.getExternalSettings(), notify: true });
    script(() => anthropicMessage(JSON.stringify(summary)));
    const deliver = vi.fn(async () => 2);
    await runCheck({ deps: { ...deps, deliver } });
    expect(deliver).toHaveBeenCalledWith({
      title: "New analysis: Crypto Banter",
      body: "BTC: the next move. Bias long; main scenario: Push to 70k.",
      tag: "external-NEWEST00001",
      url: "/external?video=NEWEST00001",
    });
  });

  it("is watched by Gemini when it has no captions and Gemini is the provider", async () => {
    add();
    videos = [{ ...videos[0]!, captions: false }];
    setSetting("aiProvider", "google");
    vi.stubEnv("GEMINI_API_KEY", "fixture-gemini-key");
    const provider = script(() => geminiMessage(JSON.stringify(summary)));
    await runCheck({ deps });
    expect(store.getVideo("NEWEST00001")).toMatchObject({ status: "summarized", source: "video" });
    expect(JSON.stringify(provider.body(0))).toContain(
      '"fileUri":"https://www.youtube.com/watch?v=NEWEST00001"',
    );
  });

  it("is summarised in the chosen language, and a disabled channel is left alone", async () => {
    const channel = add();
    videos = [videos[0]!];
    store.saveExternalSettings({ ...store.getExternalSettings(), language: "Spanish" });
    let provider = script(() => anthropicMessage(JSON.stringify(summary)));
    await runCheck({ deps });
    expect(JSON.stringify(provider.body(0))).toContain("Write every text field in Spanish");
    store.setChannelEnabled(channel.id, false);
    videos = [{ id: "ANOTHER0001", hoursAgo: 1, title: "More", captions: true }];
    provider = script();
    await runCheck({ deps });
    expect(store.getVideo("ANOTHER0001")).toBeNull();
    expect(provider.fetcher).not.toHaveBeenCalled();
  });
});

describe("the daily check", () => {
  it("runs once a day, from the chosen time on, in the journal's timezone", () => {
    const at = (iso: string) => Date.parse(iso);
    expect(dailyDue(at("2026-09-29T07:59:00Z"), "UTC", "08:00", null).due).toBe(false);
    expect(dailyDue(at("2026-09-29T08:00:00Z"), "UTC", "08:00", null)).toEqual({
      due: true,
      today: "2026-09-29",
    });
    expect(dailyDue(at("2026-09-29T20:00:00Z"), "UTC", "08:00", "2026-09-29").due).toBe(false);
    // 06:30 UTC is 08:30 in Madrid (summer time).
    expect(dailyDue(at("2026-09-29T06:30:00Z"), "Europe/Madrid", "08:00", "2026-09-28").due).toBe(
      true,
    );
  });
});

describe("the scheduler", () => {
  it("reads the feeds once a day and only retries in between", async () => {
    const channel = store.addChannel({ channelId: CHANNEL, title: "Crypto Banter", url: "x" });
    store.markChannelChecked(channel.id, null);
    videos = [videos[0]!];
    script(() => anthropicMessage(JSON.stringify(summary)));
    let now = NOW; // 12:00 UTC, after the 08:00 check time
    const scheduler = new ExternalScheduler({ deps: { ...deps, now: () => now } });
    await scheduler.tick();
    const feeds = () => requests.filter((u) => u.includes("feeds/videos.xml")).length;
    expect(feeds()).toBe(1);
    expect(store.getVideo("NEWEST00001")!.status).toBe("summarized");
    now += 15 * 60_000;
    await scheduler.tick();
    expect(feeds()).toBe(1);
    // The next day at 08:00 it reads them again.
    now = Date.parse("2026-09-30T08:05:00Z");
    await scheduler.tick();
    expect(feeds()).toBe(2);
  });
});

describe("the journal day", () => {
  it("shows the opinions published that day and the evening before", async () => {
    const channel = store.addChannel({ channelId: CHANNEL, title: "Crypto Banter", url: "x" });
    const put = (id: string, iso: string) =>
      store.recordVideo({
        videoId: id,
        channelId: channel.channelId,
        title: id,
        url: `u${id}`,
        publishedAt: iso,
        description: "",
        status: "summarized",
      });
    put("DAYOF000001", "2026-09-29T09:00:00.000Z");
    put("EVENING0001", "2026-09-28T21:00:00.000Z");
    put("TWODAYS0001", "2026-09-27T21:00:00.000Z");
    put("NEXTDAY0001", "2026-09-30T01:00:00.000Z");
    const body = await (
      await dayRoute.GET(new Request("http://localhost/api/external/day?date=2026-09-29"))
    ).json();
    expect(body.videos.map((v: { videoId: string; day: string }) => [v.videoId, v.day])).toEqual([
      ["DAYOF000001", "2026-09-29"],
      ["EVENING0001", "2026-09-28"],
    ]);
  });
});

describe("settings", () => {
  const put = (body: unknown) =>
    externalRoute.PUT(
      new Request("http://localhost", { method: "PUT", body: JSON.stringify(body) }),
    );
  it("are saved when valid and refused when not", async () => {
    expect((await put({ checkTime: "07:30", language: "Spanish", notify: true })).status).toBe(200);
    expect(store.getExternalSettings()).toMatchObject({
      checkTime: "07:30",
      language: "Spanish",
      notify: true,
    });
    for (const bad of [
      { checkTime: "7:30" },
      { language: "Klingon" },
      { maxAgeDays: 0 },
      { other: 1 },
    ])
      expect((await put(bad)).status, JSON.stringify(bad)).toBe(400);
  });
});

describe("an external opinion in the journal", () => {
  const summarised = async () => {
    const channel = store.addChannel({ channelId: CHANNEL, title: "Crypto Banter", url: "x" });
    store.markChannelChecked(channel.id, null);
    videos = [videos[0]!];
    script(() => anthropicMessage(JSON.stringify(summary)));
    await runCheck({ deps });
  };
  const addToDay = (date: string) =>
    videoRoute.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ action: "add-to-day", date }),
      }),
      { params: Promise.resolve({ id: "NEWEST00001" }) },
    );

  it("is added to a day's note once, after what is already there", async () => {
    await summarised();
    db.insert(journalDays)
      .values({ date: "2026-09-29", note: "My own plan: wait for 64k.", updatedAt: "x" })
      .run();
    expect(await (await addToDay("2026-09-29")).json()).toEqual({
      added: true,
      date: "2026-09-29",
    });
    const note = db.select().from(journalDays).all()[0]!.note;
    expect(
      note.startsWith("My own plan: wait for 64k.\n\n---\n\n## External opinion: Crypto Banter"),
    ).toBe(true);
    expect(note).toContain("**Main scenario: Push to 70k** (long, BTC)");
    expect(note).toContain("- BTC long from 63200, stop 61400, take profit 70000");
    expect(await (await addToDay("2026-09-29")).json()).toMatchObject({ added: false });
    // A day with no note yet gets the section alone.
    await addToDay("2026-09-30");
    expect(
      db
        .select()
        .from(journalDays)
        .all()
        .find((d) => d.date === "2026-09-30")!
        .note.startsWith("## External opinion"),
    ).toBe(true);
  });

  it("is read by the AI chat as someone else's opinion", async () => {
    await summarised();
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    try {
      const scope = readAiRequest({ question: "q", filters: {}, timeZone: "UTC" }, "question");
      const run = (input: unknown) =>
        journalTools({ scope }).external_opinions!.execute!(
          input as never,
          { toolCallId: "t", messages: [] } as never,
        ) as Promise<{
          opinions: { channel: string; summary: { mainScenario: { title: string } } }[];
        }>;
      const all = await run({});
      expect(all.opinions).toHaveLength(1);
      expect(all.opinions[0]).toMatchObject({
        channel: "Crypto Banter",
        summary: { mainScenario: { title: "Push to 70k" } },
      });
      expect((await run({ instrument: "ETH" })).opinions).toEqual([]);
      expect((await run({ instrument: "BTCUSDT" })).opinions).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
