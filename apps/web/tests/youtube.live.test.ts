import { describe, expect, it } from "vitest";
import {
  fetchFeed,
  fetchTranscript,
  resolveChannel,
} from "../src/server/external-analysis/youtube";

/**
 * Against the real YouTube (network): run with LIVE_YOUTUBE=1. Skipped otherwise, so CI never
 * depends on YouTube. It checks that channel lookup, the feed and captions still work, since
 * YouTube changes these endpoints from time to time.
 */
describe.skipIf(!process.env.LIVE_YOUTUBE)("YouTube, live", () => {
  it("resolves a handle, reads the feed and a transcript", { timeout: 60_000 }, async () => {
    const channel = await resolveChannel("@CryptoBanterGroup");
    expect(channel.channelId).toMatch(/^UC/);
    const feed = await fetchFeed(channel.channelId);
    expect(feed.videos.length).toBeGreaterThan(0);
    let transcript = null;
    for (const video of feed.videos.slice(0, 4)) {
      transcript = await fetchTranscript(video.videoId);
      console.log(
        video.title,
        "|",
        transcript.language,
        transcript.automatic,
        transcript.text?.length,
        transcript.reason,
      );
      if (transcript.text) break;
    }
    expect(transcript?.text?.length).toBeGreaterThan(500);
    expect(transcript?.text).toMatch(/^\[0:\d\d\]/);
  });

  it(
    "resolves a channel from one of its videos and from a channel URL",
    { timeout: 60_000 },
    async () => {
      const byVideo = await resolveChannel("https://www.youtube.com/watch?v=H1rZejlqJuE");
      const byUrl = await resolveChannel(`https://www.youtube.com/channel/${byVideo.channelId}`);
      expect(byUrl.channelId).toBe(byVideo.channelId);
      console.log(byVideo);
    },
  );
});
