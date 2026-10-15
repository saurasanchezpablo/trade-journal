export const AI_PROVIDERS = ["anthropic", "openai", "google", "compatible"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** OpenAI-compatible servers host different models, so that provider has no default. */
export const AI_DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-4.1-mini",
  google: "gemini-3.8-flash",
  compatible: "",
};

export const AI_PROVIDER_NAMES: Record<AiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google Gemini",
  compatible: "OpenAI-compatible",
};

/**
 * Server environment variables that supply each hosted provider's key (first one set wins).
 * A compatible server never receives an environment key.
 */
export const AI_KEY_ENVIRONMENT: Record<AiProvider, readonly string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  compatible: [],
};

/** What a provider's keys look like, as a hint in the key field. */
export const AI_KEY_PLACEHOLDERS: Record<AiProvider, string> = {
  anthropic: "sk-ant-…",
  openai: "sk-…",
  google: "AIza…",
  compatible: "Optional",
};

export interface AiConnection {
  configured: boolean;
  source: "environment" | "saved" | null;
  model: string;
  /** The environment variable supplying the key, when it comes from the server. */
  environmentKey: string | null;
  /** Server URL of the OpenAI-compatible provider; null for hosted providers. */
  baseUrl: string | null;
}

export interface AiSettingsPayload {
  aiProvider: AiProvider;
  aiConfigured: boolean;
  aiModel: string;
  aiConnections: Record<AiProvider, AiConnection>;
}

export const isAiProvider = (value: unknown): value is AiProvider =>
  typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value);
