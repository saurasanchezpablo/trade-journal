import { handler, ok, requireValue } from "@/server/api";
import { workspaceStateProblem } from "@/lib/chart-workspace";
import { clearWorkspace, readWorkspace, writeWorkspace } from "@/server/chart-workspace/store";

/** The chart workspace's saved state: `{ state }` is Vela's state document as text. */
export const GET = handler(() => {
  const saved = readWorkspace();
  return ok({ state: saved?.state ?? null, updatedAt: saved?.updatedAt ?? null });
});

export const PUT = handler(async (request: Request) => {
  const body = (await request.json().catch(() => null)) as { state?: unknown } | null;
  const problem = workspaceStateProblem(body?.state);
  requireValue(!problem, problem ?? "");
  return ok({ updatedAt: writeWorkspace(body!.state as string) });
});

/** Start the workspace over: the next visit opens the four starting charts. */
export const DELETE = handler(() => ok({ cleared: clearWorkspace() }));
