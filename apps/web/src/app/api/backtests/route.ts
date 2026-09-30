import { handler, ok, requireValue } from "@/server/api";
import {
  requireDataset,
  requireProvider,
  requireSymbol,
} from "@/server/market-data/request-checks";
import { countSessions, createSession, listSessions, MAX_SESSIONS } from "@/server/backtest/store";
import { requireName, requirePlaybook } from "@/server/backtest/fields";
import {
  DEFAULT_SESSION_SETTINGS,
  settingsProblem,
  type SessionSettings,
} from "@/lib/backtest-session";
import { isResolution, type Resolution } from "@/lib/market-data";

export const GET = handler(() => ok({ sessions: listSessions() }));

export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as Record<string, unknown> | null;
  requireValue(body && typeof body === "object", "Invalid backtest session.");
  requireValue(countSessions() < MAX_SESSIONS, `Keep at most ${MAX_SESSIONS} backtest sessions.`);
  const provider = requireProvider(body.provider);
  const symbol = requireSymbol(body.symbol);
  const dataset = requireDataset(body.dataset);
  requireValue(isResolution(body.resolution), "Choose a supported candle resolution.");
  requireValue(
    Number.isSafeInteger(body.startAt) &&
      (body.startAt as number) > 0 &&
      (body.startAt as number) < Date.now(),
    "Choose a start date in the past.",
  );
  const settings = { ...DEFAULT_SESSION_SETTINGS, ...(body.settings as object) } as SessionSettings;
  const problem = settingsProblem(settings);
  requireValue(problem === null, problem ?? "");
  return ok({
    session: createSession({
      name: requireName(body.name),
      provider: provider.id,
      dataset,
      symbol,
      resolution: body.resolution as Resolution,
      startAt: body.startAt as number,
      settings,
      playbookId: requirePlaybook(body.playbookId),
    }),
  });
});
