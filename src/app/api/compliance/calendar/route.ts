import { requireAdmin } from "@/lib/dal";
import { openDeadlinesForTenant } from "@/lib/compliance/reminders";
import { buildIcs } from "@/lib/compliance/ics";

// plan-027 Unit 9 — download an .ics of upcoming TTB filing deadlines (5120.17 + 5000.24) for import
// into Google/Apple/Outlook calendars. Auth-gated (admin) + tenant-scoped; each VEVENT carries alarms
// at one week / two days / the day before (see ics.ts). Not cached — reflects the current profile.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireAdmin();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return new Response("No active winery.", { status: 400 });

  const now = new Date();
  // A rolling year ahead; skip already-past deadlines so the calendar isn't cluttered with history.
  const deadlines = await openDeadlinesForTenant(tenantId, now, { horizonDays: 400, overdueDays: 0 });
  const ics = buildIcs(deadlines, { tenantId, calName: "Cellarhand — TTB filing deadlines", dtStampIso: now.toISOString() });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bwc-ttb-deadlines.ics"',
      "Cache-Control": "no-store",
    },
  });
}
