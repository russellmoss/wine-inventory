import { getCurrentUser } from "@/lib/dal";
import { searchConversations } from "@/lib/assistant/conversations";

export const runtime = "nodejs";

// Full-text search across the caller's conversations. ?q= is the search text;
// empty/whitespace returns no results. Matches message bodies (tsvector) and
// titles (ILIKE), ranked, with a highlighted snippet per conversation.
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await searchConversations({ ownerUserId: user.id, query: q });
  return Response.json({ results });
}
