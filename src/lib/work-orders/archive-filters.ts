// Phase 9.1 (Unit 5): pure filter/param helpers for the work-order archive. No prisma import — these build
// a plain where-object + parse/serialize the querystring, so they're unit-tested directly. The archive is
// the set of FINALIZED work orders (APPROVED | CANCELLED); a status filter narrows within that set.

export const ARCHIVE_STATUSES = ["APPROVED", "CANCELLED"] as const;
export type ArchiveStatus = (typeof ARCHIVE_STATUSES)[number];

export type ArchiveFilters = {
  status?: ArchiveStatus;
  from?: string; // ISO date (updatedAt >= start-of-day)
  to?: string; // ISO date (updatedAt <= end-of-day)
  assigneeEmail?: string;
  templateId?: string;
  vesselId?: string;
  q?: string; // matches title (contains) or exact WO number
};

export const ARCHIVE_PAGE_SIZE = 25;

function isArchiveStatus(v: unknown): v is ArchiveStatus {
  return typeof v === "string" && (ARCHIVE_STATUSES as readonly string[]).includes(v);
}

/** Parse a URLSearchParams-like map into typed filters (unknown/blank values dropped). */
export function parseArchiveFilters(params: Record<string, string | string[] | undefined>): ArchiveFilters {
  const one = (v: string | string[] | undefined): string | undefined => {
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  const status = one(params.status);
  return {
    status: isArchiveStatus(status) ? status : undefined,
    from: one(params.from),
    to: one(params.to),
    assigneeEmail: one(params.assigneeEmail),
    templateId: one(params.templateId),
    vesselId: one(params.vesselId),
    q: one(params.q),
  };
}

/** Serialize filters back to a querystring (stable key order; blanks omitted). */
export function serializeArchiveFilters(f: ArchiveFilters): string {
  const sp = new URLSearchParams();
  for (const key of ["status", "from", "to", "assigneeEmail", "templateId", "vesselId", "q"] as const) {
    const v = f[key];
    if (v) sp.set(key, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// A permissive shape for the where object — the DB layer passes it straight to Prisma. Kept as `unknown`
// values so this file needs no @prisma/client import (stays pure + fast to unit test).
export type ArchiveWhere = Record<string, unknown>;

/**
 * Build the Prisma `where` for the archive query from typed filters. Always constrains to the finalized set
 * (status ∈ {APPROVED, CANCELLED}); a `status` filter narrows to exactly one. Date bounds are inclusive
 * (end-of-day for `to`). `q` matches the title (case-insensitive contains) OR an exact numeric WO number.
 */
export function buildArchiveWhere(f: ArchiveFilters): ArchiveWhere {
  const where: ArchiveWhere = {};
  where.status = f.status ? f.status : { in: [...ARCHIVE_STATUSES] };

  const updatedAt: Record<string, Date> = {};
  if (f.from) {
    const d = new Date(f.from);
    if (!Number.isNaN(d.getTime())) updatedAt.gte = d;
  }
  if (f.to) {
    const d = new Date(f.to);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999); // inclusive end-of-day
      updatedAt.lte = d;
    }
  }
  if (Object.keys(updatedAt).length) where.updatedAt = updatedAt;

  if (f.assigneeEmail) where.assigneeEmail = { contains: f.assigneeEmail, mode: "insensitive" };
  if (f.templateId) where.templateVersion = { templateId: f.templateId };
  if (f.vesselId) where.tasks = { some: { OR: [{ destVesselId: f.vesselId }, { sourceVesselId: f.vesselId }] } };

  if (f.q) {
    const num = Number(f.q);
    const or: ArchiveWhere[] = [{ title: { contains: f.q, mode: "insensitive" } }];
    // WorkOrder.number is a Postgres int4 — cap at 2^31-1 so a huge numeric search doesn't overflow and 500.
    if (Number.isInteger(num) && num > 0 && num <= 2147483647) or.push({ number: num });
    where.OR = or;
  }
  return where;
}
