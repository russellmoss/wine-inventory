import { getCurrentUser } from "@/lib/dal";
import { listConversations } from "@/lib/assistant/conversations";

export const runtime = "nodejs";

// List the current user's conversations, most-recently-updated first.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const conversations = await listConversations(user.id);
  return Response.json({ conversations });
}
