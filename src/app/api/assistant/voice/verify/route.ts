import { getCurrentUser } from "@/lib/dal";
import { runAsTenant } from "@/lib/tenant/context";
import { normalizeFocusMode } from "@/lib/voice/focus";
import { verifyVoiceprintForUser } from "@/lib/voice/profile";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword || !user.activeOrganizationId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }

  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const candidateVector = Array.isArray(rec.candidateVector) ? rec.candidateVector.map(Number) : [];
  const voiceSessionId = typeof rec.voiceSessionId === "string" ? rec.voiceSessionId.slice(0, 120) : "";
  const focusMode = normalizeFocusMode(rec.focusMode);
  if (candidateVector.length === 0 || !voiceSessionId) {
    return Response.json({ error: "Missing verification input." }, { status: 400 });
  }

  try {
    const result = await runAsTenant(user.activeOrganizationId, () =>
      verifyVoiceprintForUser({
        tenantId: user.activeOrganizationId as string,
        userId: user.id,
        candidateVector,
        voiceSessionId,
        focusMode,
      }),
    );
    return Response.json({
      matched: result.matched,
      receipt: result.receipt,
      profileState: result.profileState,
    });
  } catch {
    return Response.json({ matched: false, receipt: null, profileState: "needs_reenroll" }, { status: 200 });
  }
}
