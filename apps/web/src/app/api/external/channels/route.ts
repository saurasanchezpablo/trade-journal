import { bad, handler, ok, requireValue } from "@/server/api";
import { YouTubeError, resolveChannel } from "@/server/external-analysis/youtube";
import { checkChannel, runCheck } from "@/server/external-analysis/process";
import {
  MAX_CHANNELS,
  addChannel,
  getChannel,
  listChannels,
  listVideos,
  removeChannel,
  setChannelEnabled,
} from "@/server/external-analysis/store";

/**
 * Follow a channel: its @handle, link, id, or one of its video links. Its feed is read at
 * once and its newest recent video summarised in the background.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as { input?: unknown };
  requireValue(
    body && typeof body.input === "string" && body.input.trim(),
    "Paste a YouTube channel.",
  );
  requireValue(listChannels().length < MAX_CHANNELS, `Follow at most ${MAX_CHANNELS} channels.`);
  let resolved;
  try {
    resolved = await resolveChannel(body.input, request.signal);
  } catch (error) {
    if (error instanceof YouTubeError) return bad(error.message);
    return bad("YouTube could not be reached. Try again shortly.", 502);
  }
  const known = getChannel(resolved.channelId);
  const channel = known ?? addChannel(resolved);
  if (!known) {
    await checkChannel(channel);
    // Summaries take a while; the page shows them as they arrive.
    void runCheck({ feeds: false });
  }
  return ok({
    channel: getChannel(channel.id),
    existed: Boolean(known),
    videos: listVideos({ channelId: channel.channelId, limit: 15 }),
  });
});

export const PATCH = handler(async (request: Request) => {
  const body = (await request.json()) as { id?: unknown; enabled?: unknown };
  requireValue(
    typeof body?.id === "string" && typeof body.enabled === "boolean",
    "id and enabled are required",
  );
  if (!setChannelEnabled(body.id, body.enabled)) return bad("Channel not found", 404);
  return ok({ channel: getChannel(body.id) });
});

export const DELETE = handler(async (request: Request) => {
  const body = (await request.json()) as { id?: unknown };
  requireValue(typeof body?.id === "string", "id is required");
  if (!removeChannel(body.id)) return bad("Channel not found", 404);
  return ok({ removed: true });
});
