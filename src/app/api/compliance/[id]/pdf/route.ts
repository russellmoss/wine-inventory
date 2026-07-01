import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { fillTtbPdf, type ProfileHeader } from "@/lib/compliance/fill-pdf";
import type { ComputedSnapshot } from "@/lib/compliance/generate";

// Unit 10 — auth-gated, tenant-scoped download of the filled TTB F 5120.17 PDF for a persisted report.
// The prisma extension scopes the read to the session's tenant (RLS), so a foreign report id yields
// no row (404) — never another winery's report.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  if (user.role !== "admin") {
    return Response.json({ error: "Compliance reports are admin-only." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const report = await prisma.complianceReport.findUnique({ where: { id } });
  if (!report) return Response.json({ error: "Report not found." }, { status: 404 });

  const profileRow = await prisma.complianceProfile.findFirst();
  const profile: ProfileHeader = {
    ein: profileRow?.ein ?? null,
    registryNumber: profileRow?.registryNumber ?? null,
    operatedBy: profileRow?.operatedByName
      ? [profileRow.operatedByName, profileRow.operatedByAddress, profileRow.operatedByPhone].filter(Boolean).join(" · ")
      : null,
  };

  const { bytes } = await fillTtbPdf({
    computed: report.computed as unknown as ComputedSnapshot,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    cadence: report.cadence,
    version: report.version,
    isFinalBusinessReport: report.isFinalBusinessReport,
    remarks: report.remarks,
    profile,
  });

  const period = report.periodEnd.toISOString().slice(0, 7);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="TTB-5120.17-${period}-${report.version.toLowerCase()}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
