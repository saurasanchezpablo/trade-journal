import { describe, expect, it } from "vitest";
import {
  channelIdFromPage,
  parseChannelInput,
  parseFeed,
  parseTranscript,
  pickCaptionTrack,
  transcriptText,
} from "../src/lib/youtube";

const ID = "UCN9Nj4tjXbVTLYWN0EKly_Q";

describe("a channel as pasted", () => {
  it("is understood from its id, handle, URLs or one of its videos", () => {
    expect(parseChannelInput(ID)).toEqual({ kind: "id", channelId: ID });
    expect(parseChannelInput(`https://www.youtube.com/channel/${ID}/videos`)).toEqual({
      kind: "id",
      channelId: ID,
    });
    expect(parseChannelInput("@CryptoBanterGroup")).toEqual({
      kind: "page",
      url: "https://www.youtube.com/@CryptoBanterGroup",
    });
    expect(parseChannelInput("youtube.com/@CryptoBanterGroup/videos")).toEqual({
      kind: "page",
      url: "https://www.youtube.com/@CryptoBanterGroup",
    });
    expect(parseChannelInput("https://www.youtube.com/c/SomeName")).toEqual({
      kind: "page",
      url: "https://www.youtube.com/c/SomeName",
    });
    expect(parseChannelInput("https://www.youtube.com/watch?v=H1rZejlqJuE&t=30")).toEqual({
      kind: "video",
      videoId: "H1rZejlqJuE",
    });
    expect(parseChannelInput("https://youtu.be/H1rZejlqJuE")).toEqual({
      kind: "video",
      videoId: "H1rZejlqJuE",
    });
    expect(parseChannelInput("https://m.youtube.com/shorts/H1rZejlqJuE")).toEqual({
      kind: "video",
      videoId: "H1rZejlqJuE",
    });
  });

  it("is refused when it is not YouTube", () => {
    for (const bad of [
      "",
      "hello world",
      "https://vimeo.com/123",
      "https://www.youtube.com/watch?v=short",
      "@x",
    ])
      expect(parseChannelInput(bad), bad).toBeNull();
  });

  it("finds the channel id on its page", () => {
    expect(
      channelIdFromPage(
        `<link rel="alternate" type="application/rss+xml" href="https://www.youtube.com/feeds/videos.xml?channel_id=${ID}">`,
      ),
    ).toBe(ID);
    expect(channelIdFromPage(`{"externalId":"${ID}"}`)).toBe(ID);
    expect(channelIdFromPage("<html>consent</html>")).toBeNull();
  });
});

describe("a channel's feed", () => {
  const feed = `<?xml version="1.0"?><feed><yt:channelId>${ID.slice(2)}</yt:channelId><title>Crypto &amp; Co</title>
<entry><yt:videoId>AAAAAAAAAAA</yt:videoId><title>Old one</title><published>2026-09-28T09:00:00+00:00</published><media:group><media:description>Levels &quot;to watch&quot;</media:description></media:group></entry>
<entry><yt:videoId>BBBBBBBBBBB</yt:videoId><title>BTC: next move?</title><published>2026-09-29T14:09:07+00:00</published><media:group><media:description></media:description></media:group></entry>
<entry><yt:videoId>bad</yt:videoId><title>Broken</title><published>2026-09-29T14:09:07+00:00</published></entry></feed>`;

  it("lists its videos newest first, with their links", () => {
    const parsed = parseFeed(feed);
    expect(parsed.title).toBe("Crypto & Co");
    expect(parsed.channelId).toBe(ID);
    expect(parsed.videos.map((v) => [v.videoId, v.title, v.publishedAt])).toEqual([
      ["BBBBBBBBBBB", "BTC: next move?", "2026-09-29T14:09:07.000Z"],
      ["AAAAAAAAAAA", "Old one", "2026-09-28T09:00:00.000Z"],
    ]);
    expect(parsed.videos[1]!.description).toBe('Levels "to watch"');
    expect(parsed.videos[0]!.url).toBe("https://www.youtube.com/watch?v=BBBBBBBBBBB");
  });
});

describe("a video's transcript", () => {
  it("prefers the author's own captions in a preferred language, else the automatic ones", () => {
    const tracks = [
      { baseUrl: "a", languageCode: "ar" },
      { baseUrl: "b", languageCode: "en", kind: "asr" },
      { baseUrl: "c", languageCode: "es" },
    ];
    expect(pickCaptionTrack(tracks)?.baseUrl).toBe("c");
    expect(pickCaptionTrack(tracks.slice(0, 2))?.baseUrl).toBe("b");
    expect(pickCaptionTrack([])).toBeNull();
  });

  it("reads both caption formats as timed lines, and marks the time every half minute", () => {
    const format3 = `<timedtext format="3"><body><p t="560" d="6000">Yo fam, &amp; welcome</p><p t="31000" d="2000"><s>BTC</s><s> at 65k</s></p></body></timedtext>`;
    expect(parseTranscript(format3)).toEqual([
      { start: 0.56, text: "Yo fam, & welcome" },
      { start: 31, text: "BTC at 65k" },
    ]);
    const old = `<transcript><text start="0.56" dur="6">Hello &#39;there&#39;</text><text start="75.2" dur="3">Stop at 61k</text></transcript>`;
    const lines = parseTranscript(old);
    expect(lines).toEqual([
      { start: 0.56, text: "Hello 'there'" },
      { start: 75.2, text: "Stop at 61k" },
    ]);
    expect(transcriptText(lines)).toBe("[0:00] Hello 'there'\n[1:15] Stop at 61k");
  });
});
