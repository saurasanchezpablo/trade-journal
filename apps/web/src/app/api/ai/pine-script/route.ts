import { handler, ok, requireValue } from "@/server/api";
import { runAi } from "@/server/ai";
import { streamedAnswer, wantsStream } from "@/server/ai-stream";
import { pineAiProblem, pinePrompt, readPineAnswer, type PineAiInput } from "@/lib/pine-ai";

/**
 * A Pine Script strategy written by the AI for the strategy tester: `{ mode, request,
 * current?, error? }` (create a new one, change the one in the editor, or fix the one that
 * failed). Answers `{ script, notes }`; nothing is saved or run until the trader chooses.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const problem = pineAiProblem(body);
  requireValue(!problem, problem ?? "");
  requireValue(
    Object.keys(body!).every((k) => ["mode", "request", "current", "error", "stream"].includes(k)),
    "Unknown field",
  );
  const input: PineAiInput = {
    mode: body!.mode as PineAiInput["mode"],
    request: typeof body!.request === "string" ? body!.request : "",
    current: typeof body!.current === "string" ? body!.current : "",
    error: typeof body!.error === "string" ? body!.error : "",
  };
  const ai = { prompt: pinePrompt(input), maxOutputTokens: 3000 };
  const result = (text: string) => readPineAnswer(text);
  if (wantsStream(body!.stream)) return streamedAnswer(request, ai, result);
  return ok(result(await runAi(ai.prompt, ai.maxOutputTokens)));
});
