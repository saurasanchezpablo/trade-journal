import { NoObjectGeneratedError, Output, generateText, jsonSchema, type JSONSchema7 } from "ai";
import { AI_SYSTEM, aiFailure, aiModel, withImages, type AiImage } from "./ai";

/**
 * An AI answer as data the journal can act on (suggested labels, plan scenarios, rule checks,
 * price levels), never applied without the trader's click. The provider is asked for JSON
 * matching `schema`, and `read` checks it by hand: a malformed answer is an error, not a
 * guess.
 */
export async function runAiObject<T>(options: {
  prompt: string;
  schema: JSONSchema7;
  /** A short name for the answer, which some providers use as guidance. */
  name: string;
  read: (value: unknown) => T;
  maxOutputTokens?: number;
  images?: AiImage[];
  /** A video the provider watches itself (Gemini reads public YouTube links). */
  videoUrl?: string;
}): Promise<T> {
  const model = aiModel();
  let value: unknown;
  try {
    const result = await generateText({
      ...model,
      system: AI_SYSTEM,
      ...(options.videoUrl
        ? {
            messages: [
              {
                role: "user" as const,
                content: [
                  { type: "text" as const, text: options.prompt },
                  {
                    type: "file" as const,
                    data: new URL(options.videoUrl),
                    mediaType: "video/mp4",
                  },
                ],
              },
            ],
          }
        : withImages(options.prompt, options.images ?? [])),
      output: Output.object({ schema: jsonSchema(options.schema), name: options.name }),
      maxOutputTokens: options.maxOutputTokens ?? 1500,
    });
    value = result.output;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error))
      throw new Error("AI returned an answer the journal could not read. Try again.");
    throw aiFailure(error);
  }
  try {
    return options.read(value);
  } catch {
    throw new Error("AI returned an answer the journal could not read. Try again.");
  }
}

/** Small readers for `read`: each throws on anything unexpected. */
export const read = {
  object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object");
    return value as Record<string, unknown>;
  },
  array(value: unknown, max: number): unknown[] {
    if (!Array.isArray(value) || value.length > max) throw new Error("array");
    return value;
  },
  text(value: unknown, max: number): string {
    if (typeof value !== "string") throw new Error("text");
    return value.trim().slice(0, max);
  },
  number(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("number");
    return value;
  },
  oneOf<T extends string>(value: unknown, choices: readonly T[]): T {
    if (!choices.includes(value as T)) throw new Error("choice");
    return value as T;
  },
};
