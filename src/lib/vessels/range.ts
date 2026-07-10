import { listGroups, type VesselRef } from "@/lib/vessels/groups";

// Phase 9.4a: expand a member set for a group rack from one of three shapes — a vessel-code RANGE
// ("B101-B110"), a saved VesselGroup NAME, or an explicit list of codes. Range expansion is PURE
// (no DB); saved-group resolution reads the tenant's groups. Neither existed before 9.4a — the NL
// resolver (nl-resolve.ts) and any UI use these to turn "B101-B110" / "the north barrels" into a
// concrete, ordered member list before per-member vessel resolution.

const MAX_RANGE = 300; // a safety bound; a real barrel group is dozens, not thousands.

/**
 * Expand a vessel-code range like "B101-B110", "T4-T20", "BBL 1 - 10" into an ordered code list.
 * Zero-padding follows the widest endpoint ("B01-B10" → B01..B10). Returns null when the text isn't a
 * range (so callers fall through to group-name / explicit-list resolution). Throws on an inverted or
 * oversized range so the mistake surfaces instead of silently producing junk.
 */
export function expandVesselRange(text: string): string[] | null {
  if (typeof text !== "string") return null;
  const m = text
    .trim()
    .match(/^([A-Za-z]{0,4})\s*(\d+)\s*(?:-|–|—|\bto\b|\.\.)\s*([A-Za-z]{0,4})\s*(\d+)\s*$/i);
  if (!m) return null;
  const [, p1raw, n1raw, p2raw, n2raw] = m;
  const p1 = p1raw.toUpperCase();
  const p2 = p2raw.toUpperCase();
  if (p1 && p2 && p1 !== p2) return null; // "B1-T10" is not a coherent range
  const prefix = p1 || p2;
  const start = Number(n1raw);
  const end = Number(n2raw);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end < start) throw new Error(`Range "${text.trim()}" runs backward — put the lower number first.`);
  const count = end - start + 1;
  if (count > MAX_RANGE) throw new Error(`Range "${text.trim()}" is ${count} vessels — that's too many for one work order.`);
  // Only zero-pad when the operator actually wrote leading zeros ("B01-B10"); "T4-T20" stays unpadded.
  const padded = (n1raw.length > 1 && n1raw[0] === "0") || (n2raw.length > 1 && n2raw[0] === "0");
  const width = padded ? Math.max(n1raw.length, n2raw.length) : 0;
  const codes: string[] = [];
  for (let n = start; n <= end; n++) codes.push(`${prefix}${width ? String(n).padStart(width, "0") : String(n)}`);
  return codes;
}

export type GroupNameMatch =
  | { kind: "one"; groupId: string; name: string; members: VesselRef[] }
  | { kind: "many"; names: string[] }
  | { kind: "none" };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Resolve a saved VesselGroup by (fuzzy) name for the tenant. Exact (case-insensitive) match wins;
 * otherwise a unique substring match; ambiguity returns the candidate names so the caller can ask.
 */
export async function resolveGroupByName(name: string): Promise<GroupNameMatch> {
  const target = norm(name);
  if (!target) return { kind: "none" };
  const groups = await listGroups();
  const exact = groups.filter((g) => norm(g.name) === target);
  if (exact.length === 1) return { kind: "one", groupId: exact[0].id, name: exact[0].name, members: exact[0].members };
  if (exact.length > 1) return { kind: "many", names: exact.map((g) => g.name) };
  const partial = groups.filter((g) => norm(g.name).includes(target) || target.includes(norm(g.name)));
  if (partial.length === 1) return { kind: "one", groupId: partial[0].id, name: partial[0].name, members: partial[0].members };
  if (partial.length > 1) return { kind: "many", names: partial.map((g) => g.name) };
  return { kind: "none" };
}
