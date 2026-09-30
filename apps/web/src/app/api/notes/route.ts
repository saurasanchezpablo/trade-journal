import { asc, desc, eq } from "drizzle-orm";
import { db, folders, notes } from "@/db";
import { handler, ok, requireValue } from "@/server/api";
import { readNote } from "@/server/note-fields";
import { newId, nowIso } from "@/server/ids";

export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const folderId = url.searchParams.get("folder");
  const search = url.searchParams.get("q")?.toLowerCase();
  const tag = url.searchParams.get("tag");
  const sort = url.searchParams.get("sort") ?? "updated";

  let rows =
    folderId && folderId !== "all"
      ? db.select().from(notes).where(eq(notes.folderId, folderId)).all()
      : db.select().from(notes).all();

  if (search) {
    rows = rows.filter(
      (row) =>
        row.title.toLowerCase().includes(search) || row.content.toLowerCase().includes(search),
    );
  }
  if (tag) {
    rows = rows.filter((row) => {
      try {
        return ((JSON.parse(row.tagsJson ?? "[]") as string[]) ?? []).includes(tag);
      } catch {
        return false;
      }
    });
  }
  rows.sort((a, b) =>
    sort === "created"
      ? b.createdAt.localeCompare(a.createdAt)
      : sort === "title"
        ? a.title.localeCompare(b.title)
        : b.updatedAt.localeCompare(a.updatedAt),
  );

  const folderRows = db.select().from(folders).orderBy(asc(folders.createdAt)).all();
  return ok({ notes: rows, folders: folderRows });
});

export const POST = handler(async (request: Request) => {
  const body = readNote(await request.json());
  requireValue(body.tradeKey === undefined || body.tradeKey.length > 0, "Invalid trade link.");
  requireValue(
    body.dayDate === undefined || /^\d{4}-\d{2}-\d{2}$/.test(body.dayDate),
    "Day links must be YYYY-MM-DD.",
  );
  const id = newId();
  const now = nowIso();
  db.insert(notes)
    .values({
      id,
      folderId: body.folderId ?? "my-notes",
      title: body.title ?? "",
      content: body.content ?? "",
      tagsJson: body.tags ? JSON.stringify(body.tags) : null,
      tradeKey: body.tradeKey ?? null,
      dayDate: body.dayDate ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return ok({ id });
});
