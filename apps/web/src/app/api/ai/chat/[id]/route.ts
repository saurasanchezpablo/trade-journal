import { bad, handler, ok } from "@/server/api";
import { deleteConversation, getConversation, listMessages } from "@/server/ai-agent/store";

type Params = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) return bad("Conversation not found", 404);
  return ok({ conversation, messages: listMessages(id) });
});

export const DELETE = handler(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  if (!deleteConversation(id)) return bad("Conversation not found", 404);
  return ok({ deleted: true });
});
