import { getCurrentUser } from "@/lib/dal";
import { runAsTenant } from "@/lib/tenant/context";
import { getVoiceSettingsForUser } from "@/lib/voice/profile";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword || !user.activeOrganizationId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const settings = await runAsTenant(user.activeOrganizationId, () => getVoiceSettingsForUser(user.id));
  return Response.json(settings);
}
