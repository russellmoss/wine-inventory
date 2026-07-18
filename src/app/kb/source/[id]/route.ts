// Plan 079 Unit 8 — clickable knowledge-base citations. Resolves the caller's tenant, rechecks the
// source is enabled for them (entitlement gate — the global corpus has no RLS), then 302s to the real
// source or renders a tombstone for a withdrawn one. Node runtime (ALS + Prisma), always dynamic.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { resolveCitation, renderTombstoneHtml } from "@/lib/knowledge/citation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const tenantId = user?.activeOrganizationId;
  if (!user || !tenantId) return new NextResponse("Not found", { status: 404 });

  const res = await resolveCitation(tenantId, id);
  if (res.kind === "notfound") return new NextResponse("Not found", { status: 404 });
  if (res.kind === "redirect") return NextResponse.redirect(res.url, 302);
  return new NextResponse(renderTombstoneHtml(res), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
