import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import { decryptJson, encryptJson } from "./crypto";
import { EMPTY_DEFAULTS, type JournalDefaults } from "@/lib/journal-defaults";
import {
  AI_DEFAULT_MODELS,
  AI_KEY_ENVIRONMENT,
  AI_PROVIDERS,
  isAiProvider,
  type AiConnection,
  type AiProvider,
  type AiSettingsPayload,
} from "@/lib/ai-settings";

export const getJournalDefaults = (): JournalDefaults => {
  try {
    return { ...EMPTY_DEFAULTS, ...JSON.parse(getSetting("journalDefaults") ?? "{}") };
  } catch {
    return EMPTY_DEFAULTS;
  }
};

export const getSetting = (key: string): string | null =>
  db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;

export const setSetting = (key: string, value: string): void => {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
};

export const deleteSetting = (key: string): void => {
  db.delete(settings).where(eq(settings.key, key)).run();
};

/** Journal display timezone (IANA), default UTC. */
export const getTimeZone = (): string => getSetting("timeZone") ?? "UTC";

/** Preserve the legacy parsing default until a separate import zone is saved. */
export const getImportTimeZone = (): string => getSetting("importTimeZone") ?? getTimeZone();

/** Per-symbol contract multipliers for futures/options P&L. */
export const getMultipliers = (): Record<string, number> => {
  const raw = getSetting("multipliers");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
};

/** The provider's key from the server environment, if one of its variables is set. */
export const aiKeyEnvironment = (provider: AiProvider): string | null => {
  for (const name of AI_KEY_ENVIRONMENT[provider]) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
};

/** Which environment variable supplies the provider's key, for the Settings page. */
export const aiKeyEnvironmentName = (provider: AiProvider): string | null =>
  AI_KEY_ENVIRONMENT[provider].find((name) => process.env[name]?.trim()) ?? null;

/** Provider keys are stored separately and encrypted like broker credentials. */
export const getAiKey = (provider: AiProvider): string | null => {
  const environment = aiKeyEnvironment(provider);
  if (environment) return environment;
  const envelope = getSetting(`${provider}KeyEnc`);
  if (!envelope) return null;
  try {
    const key = decryptJson<unknown>(envelope);
    return typeof key === "string" ? key.trim() || null : null;
  } catch {
    return null;
  }
};

export const setAiKey = (provider: AiProvider, key: string | null): void => {
  if (key === null) deleteSetting(`${provider}KeyEnc`);
  else setSetting(`${provider}KeyEnc`, encryptJson(key.trim()));
};

export const getAnthropicKey = (): string | null => getAiKey("anthropic");
export const setAnthropicKey = (key: string | null): void => setAiKey("anthropic", key);

export const getAiProvider = (): AiProvider => {
  const selected = getSetting("aiProvider");
  if (isAiProvider(selected)) return selected;
  // Preserve existing Anthropic setups; a setup with only one other provider's key works
  // without a visit to Settings (OpenAI before Gemini when both are present).
  if (getAiKey("anthropic")) return "anthropic";
  if (getAiKey("openai")) return "openai";
  if (getAiKey("google")) return "google";
  return "anthropic";
};

/** The settings key of a provider's model (Anthropic keeps its original key). */
export const aiModelSetting = (provider: AiProvider): string =>
  provider === "anthropic" ? "aiModel" : `${provider}Model`;

export const getAiModel = (provider: AiProvider): string =>
  getSetting(aiModelSetting(provider))?.trim() || AI_DEFAULT_MODELS[provider];

export const getAiSettings = (): AiSettingsPayload => {
  const aiProvider = getAiProvider();
  const connection = (provider: AiProvider) => ({
    configured: Boolean(getAiKey(provider)),
    source: aiKeyEnvironment(provider)
      ? ("environment" as const)
      : getAiKey(provider)
        ? ("saved" as const)
        : null,
    model: getAiModel(provider),
    environmentKey: aiKeyEnvironmentName(provider),
  });
  const aiConnections = Object.fromEntries(
    AI_PROVIDERS.map((provider) => [provider, connection(provider)]),
  ) as Record<AiProvider, AiConnection>;
  return {
    aiProvider,
    aiConfigured: aiConnections[aiProvider].configured,
    aiModel: aiConnections[aiProvider].model,
    aiConnections,
  };
};
