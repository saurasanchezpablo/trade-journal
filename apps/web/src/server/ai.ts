import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, RetryError, generateText } from "ai";
import { getAiKey, getAiModel, getAiProvider } from "./settings";
import { AI_PROVIDER_NAMES } from "@/lib/ai-settings";

/**
 * BYO-key AI. Self-hosted means YOUR key on YOUR box: the key is read from the
 * encrypted settings store (or the selected provider's environment variable).
 * Requests go straight from this server to the selected provider.
 */
export const aiConfigured = (): boolean => getAiKey(getAiProvider()) !== null;

export const AI_SYSTEM = `You are the reflection layer of a trader's journal.
You see only the trader's own recorded data — trades, stats, notes, and chart analyses they
drew (sometimes as images). Ground every
statement in those numbers; never invent trades, prices, or market context you weren't given.
Be direct and specific like a good trading coach: name the behavior, cite the numbers,
say what to keep and what to fix. No platitudes, no disclaimers about trading being risky —
the trader knows. Keep it tight.`;

/** The configured provider's model and request options; throws when no key is set. */
export const aiModel = () => {
  const provider = getAiProvider();
  const apiKey = getAiKey(provider);
  if (!apiKey) {
    throw new Error(
      `AI is not configured — add your ${AI_PROVIDER_NAMES[provider]} API key in Settings.`,
    );
  }
  const model = getAiModel(provider);
  return {
    model:
      provider === "openai"
        ? createOpenAI({ apiKey }).responses(model)
        : provider === "google"
          ? createGoogleGenerativeAI({ apiKey })(model)
          : createAnthropic({ apiKey })(model),
    ...(provider === "openai" ? { providerOptions: { openai: { store: false } } } : {}),
  };
};

/**
 * A provider failure as a message safe to show. Provider error messages can contain key
 * fragments or request data, so they are never relayed.
 */
export function aiFailure(error: unknown): Error {
  if (RetryError.isInstance(error)) error = error.lastError;
  if (APICallError.isInstance(error)) {
    // Gemini answers a wrong key with 400 "API key not valid" rather than 401.
    if (
      error.statusCode === 401 ||
      error.statusCode === 403 ||
      /API key not valid|API_KEY_INVALID/i.test(error.message)
    )
      return new Error(
        "AI authentication_error: check your provider key and permissions in Settings.",
      );
    if (
      /credit balance|billing|insufficient_quota|exceeded your current quota|billing account/i.test(
        error.message,
      )
    )
      return new Error("AI billing: check your provider account's credits and quota.");
    if (error.statusCode === 429 || error.statusCode === 529)
      return new Error("AI rate limit: please try again shortly.");
    if (
      error.statusCode === 404 ||
      /model.*(?:not found|does not exist|access)/i.test(error.message)
    )
      return new Error(
        "AI model unavailable: check the model ID and your provider access in Settings.",
      );
  }
  return new Error("AI request failed. Check your provider settings or try again shortly.");
}

/** `images` are PNGs sent after the prompt, in order; the prompt should refer to them. */
export const runAi = async (
  prompt: string,
  maxOutputTokens = 1200,
  images: Buffer[] = [],
): Promise<string> => {
  const model = aiModel();
  let result: Awaited<ReturnType<typeof generateText>>;
  try {
    result = await generateText({
      ...model,
      system: AI_SYSTEM,
      ...(images.length
        ? {
            messages: [
              {
                role: "user" as const,
                content: [
                  { type: "text" as const, text: prompt },
                  ...images.map((image) => ({
                    type: "image" as const,
                    image,
                    mediaType: "image/png",
                  })),
                ],
              },
            ],
          }
        : { prompt }),
      maxOutputTokens,
    });
  } catch (error) {
    throw aiFailure(error);
  }
  // Checked outside the request's error handling, so its own message reaches the user.
  if (!result.text.trim())
    throw new Error(
      result.finishReason === "content-filter"
        ? "AI returned no text: the provider's safety filter blocked the answer."
        : "AI returned no text. Check the model or try again.",
    );
  return result.text;
};
