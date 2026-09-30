import { eq } from "drizzle-orm";
import { db, playbooks } from "@/db";
import { requireValue } from "../api";

/** A playbook id that exists, or null; a 400 otherwise. */
export function requirePlaybook(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  requireValue(typeof value === "string", "Choose a playbook.");
  requireValue(
    Boolean(db.select({ id: playbooks.id }).from(playbooks).where(eq(playbooks.id, value)).get()),
    "That playbook no longer exists.",
  );
  return value;
}

export const requireName = (value: unknown): string => {
  requireValue(
    typeof value === "string" && value.trim().length > 0 && value.length <= 100,
    "Give the session a name of up to 100 characters.",
  );
  return value.trim();
};
