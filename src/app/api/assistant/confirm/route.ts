import { getCurrentUser } from "@/lib/dal";
import { commitProposal } from "@/lib/assistant/commit";

// The ONLY commit path for assistant writes. Verifies the signed proposal,
// burns its single-use nonce, then calls the real server action (which re-runs
// auth, scoping, validation, and writeAudit).
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
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

  const token = (body as { token?: unknown })?.token;
  if (typeof token !== "string" || token.length === 0) {
    return Response.json({ error: "Missing confirmation token." }, { status: 400 });
  }

  try {
    const result = await commitProposal(user, token);
    return Response.json({ ok: true, message: result.message });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not apply the change." },
      { status: 400 },
    );
  }
}
