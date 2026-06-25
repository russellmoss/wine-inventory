import { getCurrentUser } from "@/lib/dal";
import {
  getConversation,
  renameConversation,
  deleteConversation,
} from "@/lib/assistant/conversations";

export const runtime = "nodejs";

const MAX_TITLE_LEN = 120;

// Resume a conversation: its title + message history (text turns only),
// ownership-checked. 404 if it doesn't exist or isn't the caller's.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const convo = await getConversation({ id, ownerUserId: user.id });
  if (!convo) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json(convo);
}

// Rename a conversation. Ownership-checked (404 if not the caller's).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }

  const rawTitle = (body as { title?: unknown })?.title;
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title || title.length > MAX_TITLE_LEN) {
    return Response.json({ error: "Invalid title." }, { status: 400 });
  }

  const ok = await renameConversation({ id, ownerUserId: user.id, title });
  if (!ok) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json({ ok: true, title });
}

// Delete a conversation (messages cascade). Ownership-checked.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const ok = await deleteConversation({ id, ownerUserId: user.id });
  if (!ok) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json({ ok: true });
}
