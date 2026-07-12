import { expandVesselRange } from "@/lib/vessels/range";

// Plan 055 U6 (pure): expand a natural-language member reference to the group-rack member vessels it
// selects, resolved against a SPECIFIC task's member set (never the whole cellar). Kept dependency-light (no
// server-only, no prisma) so it's directly unit-testable. The assistant tool (group-rack-batch.ts) resolves
// a saved-group name to codes first, then calls this with the concrete expression.

export type GroupRackMemberLite = { vesselId: string; code: string | null };

const REST_RE = /^(the\s+)?(rest|remaining|all|everything|all\s+remaining|all\s+the\s+rest)$/i;

/** True when the expression means "every barrel still pending" (empty, "the rest", "all remaining", …). */
export function isAllRemainingExpr(expr: string | null | undefined): boolean {
  const t = (expr ?? "").trim();
  return !t || REST_RE.test(t);
}

/** Normalize a vessel code for tolerant matching (lowercase, strip non-alphanumerics). Mirrors
 * assistant/scope.ts normVesselCode — inlined here to keep this module free of the server-only import. */
const normCode = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Resolve a member reference — a range ("B101-B104"), a comma/and list ("B101, B103 and B105"), or the
 * "rest"/"all remaining" sentinel (→ every pending member) — to the member vessel ids it selects, within
 * `members` and intersected with `pendingVesselIds`. A candidate that isn't a member is `unknown` (the tool
 * turns that into a clear error); a member that's already recorded is `droppedDone` (excluded — you can't
 * re-complete it). Deterministic + DB-free. `expandVesselRange` throws on an inverted/oversized range.
 */
export function selectGroupRackMembers(
  expr: string | null | undefined,
  members: GroupRackMemberLite[],
  pendingVesselIds: string[],
): { selected: string[]; droppedDone: string[]; unknown: string[] } {
  if (isAllRemainingExpr(expr)) {
    return { selected: [...pendingVesselIds], droppedDone: [], unknown: [] };
  }
  const trimmed = (expr ?? "").trim();
  const pending = new Set(pendingVesselIds);
  const range = expandVesselRange(trimmed); // throws on an inverted/oversized range — let it surface
  const candidates = range ?? trimmed.split(/\s*(?:,|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean);

  const byCode = new Map<string, GroupRackMemberLite>();
  for (const m of members) if (m.code) byCode.set(normCode(m.code), m);

  const selected: string[] = [];
  const droppedDone: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const member = byCode.get(normCode(c));
    if (!member) {
      unknown.push(c);
      continue;
    }
    if (!pending.has(member.vesselId)) {
      droppedDone.push(member.code ?? c);
      continue;
    }
    if (!seen.has(member.vesselId)) {
      seen.add(member.vesselId);
      selected.push(member.vesselId);
    }
  }
  return { selected, droppedDone, unknown };
}
