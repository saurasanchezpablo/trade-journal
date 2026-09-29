import { handler, ok, requireValue } from "@/server/api";
import { aiConfigured } from "@/server/ai";
import { getAiProvider } from "@/server/settings";
import { checkRunning } from "@/server/external-analysis/process";
import {
  LANGUAGES,
  getExternalSettings,
  listChannels,
  listVideos,
  readExternalSettings,
  saveExternalSettings,
} from "@/server/external-analysis/store";

const state = (channelId?: string | null) => ({
  settings: getExternalSettings(),
  languages: LANGUAGES,
  channels: listChannels(),
  videos: listVideos({ channelId: channelId ?? undefined, limit: 60 }),
  checking: checkRunning(),
  ai: { configured: aiConfigured(), provider: getAiProvider() },
});

/** The External analysis page: settings, channels and their latest videos with summaries. */
export const GET = handler(async (request: Request) =>
  ok(state(new URL(request.url).searchParams.get("channel"))),
);

export const PUT = handler(async (request: Request) => {
  const body = (await request.json()) as Record<string, unknown>;
  requireValue(body && typeof body === "object" && !Array.isArray(body), "Invalid settings");
  requireValue(
    Object.keys(body).every((k) =>
      ["checkTime", "maxAgeDays", "minMinutes", "language", "notify"].includes(k),
    ),
    "Unknown setting",
  );
  const next = readExternalSettings({ ...getExternalSettings(), ...body });
  // Anything the reader had to replace was malformed: refuse rather than save a default.
  for (const key of Object.keys(body) as (keyof typeof next)[])
    requireValue(next[key] === body[key], `Invalid ${key}`);
  saveExternalSettings(next);
  return ok(state());
});
