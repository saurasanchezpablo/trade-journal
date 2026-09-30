import { bad, handler, ok, requireValue } from "@/server/api";
import { deleteSession, getSession, updateSession } from "@/server/backtest/store";
import { settingsProblem, stateProblem, type SessionSettings } from "@/lib/backtest-session";
import { requireName, requirePlaybook } from "@/server/backtest/fields";

type Context = { params: Promise<{ id: string }> };

const MAX_DRAWINGS_BYTES = 2 * 1024 * 1024;

export const GET = handler(async (_request: Request, { params }: Context) => {
  const session = getSession((await params).id);
  return session ? ok({ session }) : bad("Backtest session not found.", 404);
});

/** Save what changed: the replay's position, the engine state, settings, drawings or notes. */
export const PATCH = handler(async (request: Request, { params }: Context) => {
  const { id } = await params;
  const current = getSession(id);
  if (!current) return bad("Backtest session not found.", 404);
  const body = (await request.json()) as Record<string, unknown> | null;
  requireValue(body && typeof body === "object", "Invalid backtest update.");
  const patch: Parameters<typeof updateSession>[1] = {};
  if (body.name !== undefined) patch.name = requireName(body.name);
  if (body.notes !== undefined) {
    requireValue(
      typeof body.notes === "string" && body.notes.length <= 100_000,
      "The notes are too long.",
    );
    patch.notes = body.notes;
  }
  if (body.cursorAt !== undefined) {
    requireValue(
      Number.isSafeInteger(body.cursorAt) && (body.cursorAt as number) >= 0,
      "Invalid replay position.",
    );
    patch.cursorAt = body.cursorAt as number;
  }
  if (body.settings !== undefined) {
    const problem = settingsProblem(body.settings);
    requireValue(problem === null, problem ?? "");
    patch.settings = body.settings as SessionSettings;
  }
  if (body.state !== undefined) {
    const problem = stateProblem(body.state);
    requireValue(problem === null, problem ?? "");
    patch.state = body.state;
  }
  if (body.drawings !== undefined) {
    requireValue(
      body.drawings === null ||
        (typeof body.drawings === "object" &&
          JSON.stringify(body.drawings).length <= MAX_DRAWINGS_BYTES),
      "The drawings are too large to save.",
    );
    patch.drawings = body.drawings;
  }
  if (body.playbookId !== undefined) patch.playbookId = requirePlaybook(body.playbookId);
  return ok({ session: updateSession(id, patch) });
});

export const DELETE = handler(async (_request: Request, { params }: Context) =>
  deleteSession((await params).id)
    ? ok({ deleted: true })
    : bad("Backtest session not found.", 404),
);
