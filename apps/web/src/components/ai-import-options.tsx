"use client";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Settings2, X } from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import { HelpHint } from "./ui/tooltip";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { OptionSelect } from "./ui/option-select";
import { useT } from "./i18n";
import { AI_DEFAULT_MODELS, AI_PROVIDER_NAMES, type AiSettingsPayload } from "@/lib/ai-settings";
import {
  AI_IMPORT_HELP,
  type AiImportOptions as Options,
  type AiImportProvider,
} from "@/lib/ai-import";

export function AiImportOptions({
  enabled,
  onEnabledChange,
  value,
  onChange,
  settings,
  disabled,
}: {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  value: Options;
  onChange: (value: Options) => void;
  settings?: AiSettingsPayload;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const provider = AI_PROVIDER_NAMES[value.provider];
  const [keysBefore = "", keysAfter = ""] = t("Manage saved keys in {link}.").split("{link}");
  const [sendBefore = "", sendAfter = ""] = t(
    "Your file will be sent to {provider} when you select {action}.",
    { provider },
  ).split("{action}");
  const connection = settings?.aiConnections[value.provider];
  return (
    <Popover.Root open={open && enabled} onOpenChange={setOpen}>
      <div className="flex shrink-0 items-center gap-1.5">
        <Checkbox
          id="ai-import-enabled"
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(checked) => {
            onEnabledChange(checked === true);
            setOpen(checked === true);
          }}
        />
        <Label
          htmlFor="ai-import-enabled"
          className="flex cursor-pointer items-center gap-1.5 text-xs font-normal text-muted-foreground"
        >
          {t("Parse with AI")}
        </Label>
        <HelpHint heading={t("AI statement parsing")}>{t(AI_IMPORT_HELP)}</HelpHint>
        {enabled && (
          <Popover.Trigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={t("AI parsing settings")}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Settings2 className="size-3.5" />
            </button>
          </Popover.Trigger>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label={t("AI parsing settings")}
          className="z-50 w-[360px] max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">{t("AI parsing settings")}</span>
            <Popover.Close
              aria-label={t("Close AI parsing settings")}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="size-4" />
            </Popover.Close>
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="import-ai-provider">{t("AI provider")}</Label>
                <OptionSelect
                  id="import-ai-provider"
                  value={value.provider}
                  disabled={disabled}
                  onValueChange={(provider) => {
                    const next = provider as AiImportProvider;
                    onChange({
                      provider: next,
                      model: settings?.aiConnections[next].model ?? AI_DEFAULT_MODELS[next],
                      apiKey: "",
                    });
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </OptionSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="import-ai-model">{t("Model ID")}</Label>
                <Input
                  id="import-ai-model"
                  value={value.model}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...value, model: e.target.value })}
                  placeholder={AI_DEFAULT_MODELS[value.provider]}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="import-ai-key">{t("{name} API key", { name: provider })}</Label>
              <Input
                id="import-ai-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={value.apiKey ?? ""}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
                placeholder={
                  connection?.configured
                    ? t("Leave blank to use your configured key")
                    : t("Enter your API key")
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("Keys entered here are used for this upload session only.")} {keysBefore}
                <a href="/settings#ai-settings" className="underline">
                  {t("Settings")}
                </a>
                {keysAfter}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {sendBefore}
              <strong>{t("Preview with AI")}</strong>
              {sendAfter}{" "}
              {t("Provider charges apply. Review the extracted trades before importing.")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                "CSV, TSV, HTML, XML, TXT and PDF · Up to 200 executions per preview. PDFs up to 8 MB; text exports up to 150,000 characters. For spreadsheets, export as CSV first. PDF support depends on your selected model.",
              )}
            </p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
