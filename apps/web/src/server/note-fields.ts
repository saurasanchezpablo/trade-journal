import { eq } from "drizzle-orm";
import { db, folders } from "@/db";
import { requireValue } from "./api";
import { optionalString, optionalStringList, requireObject } from "./request-fields";

export const MAX_NOTE_TITLE = 500;
export const MAX_NOTE_CONTENT = 1_000_000;

/** A notebook note's fields from a request body, checked by hand. */
export function readNote(raw: unknown): {
  title?: string;
  content?: string;
  tags?: string[];
  folderId?: string;
  tradeKey?: string;
  dayDate?: string;
} {
  const body = requireObject(raw, "Enter a valid note.");
  const folderId = optionalString(body.folderId, 200, "Choose an existing folder.");
  if (folderId !== undefined)
    requireValue(
      db.select({ id: folders.id }).from(folders).where(eq(folders.id, folderId)).get(),
      "Choose an existing folder.",
    );
  return {
    title: optionalString(
      body.title,
      MAX_NOTE_TITLE,
      `Titles must be at most ${MAX_NOTE_TITLE} characters.`,
    ),
    content: optionalString(
      body.content,
      MAX_NOTE_CONTENT,
      `Notes must be at most ${MAX_NOTE_CONTENT.toLocaleString("en-US")} characters.`,
    ),
    tags: optionalStringList(
      body.tags,
      { items: 100, length: 200 },
      "Tags must be a list of up to 100 labels of at most 200 characters.",
    ),
    folderId,
    tradeKey: optionalString(body.tradeKey, 2000, "Invalid trade link."),
    dayDate: optionalString(body.dayDate, 10, "Day links must be YYYY-MM-DD."),
  };
}
