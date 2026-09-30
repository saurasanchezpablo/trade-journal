import { handler, ok } from "@/server/api";
import { updateStatus } from "@/server/update-check";

/** Whether a newer version is published (checked on GitHub at most every six hours). */
export const GET = handler(async () => ok(await updateStatus()));
