"use client";

import { useApi } from "@/lib/use-api";
import type { UpdateStatus } from "@/server/update-check";
import { useT } from "./i18n";

/**
 * A quiet line in the sidebar when a newer release of the journal is published: no popup,
 * nothing to dismiss, a link to the release and its notes. Nothing shows otherwise.
 */
export function UpdateNotice() {
  const t = useT();
  const { data } = useApi<UpdateStatus>("/api/update");
  if (!data?.available || !data.url) return null;
  return (
    <div>
      <a
        href={data.url}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline-offset-2 hover:underline"
        title={t("{release} is available: see what is new", {
          release: data.name ?? data.version ?? "",
        })}
      >
        {t("A new update is available")}
      </a>
    </div>
  );
}
