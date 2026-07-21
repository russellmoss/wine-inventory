import "server-only";
import { Prisma, type WorkOrderTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isTenantAdminLike, type AppUser } from "@/lib/access";
import { parseVesselRef } from "@/lib/vessels/ref";
import type { OperationType } from "@/lib/ledger/vocabulary";
import { resolveOneOrChoice, type ResolveResult } from "./tools/resolve";
import { signResume } from "./confirm";

/**
 * Shared scoping for assistant read tools. Scoping is the handler's job, NEVER
 * trusted to the model. Managers (role !== "admin") are pinned to their vineyard
 * membership SET (D9); admins see all. Returns null when a manager has no vineyards
 * (nothing is in scope).
 */
export function scopedVineyardWhere(user: AppUser): Prisma.VineyardWhereInput | null {
  if (isTenantAdminLike(user)) return {};
  if (user.vineyardIds.length === 0) return null;
  return { id: { in: user.vineyardIds } };
}

/**
 * Resolve vineyards the user may access, optionally narrowed by a partial name.
 * Empty array means "nothing in scope / no match" — the tool decides how to
 * report that. Capped so an admin query can't fan out unbounded.
 */
export async function resolveVineyards(
  user: AppUser,
  name?: string,
): Promise<{ id: string; name: string }[]> {
  const base = scopedVineyardWhere(user);
  if (base === null) return [];
  // Scoping (`base`) is applied FIRST and is untouched here. With a name we then
  // fuzzy-match in JS (two-directional, like findScopedBlocks) instead of a
  // one-directional SQL `contains`, so a generic word the stored name omits —
  // "Bajo Vineyard"/"the bajo vineyard" vs the stored "Bajo" — still resolves.
  // This ONLY narrows within the vineyards the user can already access.
  const rows = await prisma.vineyard.findMany({
    where: base,
    orderBy: { name: "asc" },
    take: name ? 200 : 25,
    select: { id: true, name: true },
  });
  if (!name) return rows;
  return rows.filter((v) => vineyardNameMatches(v.name, name)).slice(0, 25);
}

export type ScopedBlock = {
  id: string;
  label: string;
  vineyardId: string;
  vineyardName: string;
  varietyName: string | null;
};

/** Normalize a label/variety for fuzzy compare: drop parentheticals + punctuation. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
}

/**
 * Two-directional fuzzy match between a STORED vineyard name and a user/model query:
 * normalize both (drop parentheticals + punctuation, lowercase) and accept when either
 * contains the other. This is why "Bajo Vineyard", "the bajo vineyard", and "bajo" all
 * resolve to the stored "Bajo" — a one-directional SQL `contains` matches only the first.
 * Pure and match-ONLY: never an access decision (callers scope BEFORE calling this).
 */
export function vineyardNameMatches(storedName: string, query: string): boolean {
  const hay = norm(storedName);
  const needle = norm(query);
  if (hay === "" || needle === "") return false;
  return hay === needle || hay.includes(needle) || needle.includes(hay);
}

/**
 * Find blocks the user may access, narrowed by vineyard name, grape variety, and/or
 * a fuzzy block label. Scoped to the manager's vineyard (admins see all). The label
 * match is two-directional and variety-aware so "Block 2", "Block 2 (Grenache)",
 * "block2", or even "grenache" all resolve sensibly. Used by write tools to resolve
 * a single target block before proposing a change.
 */
export async function findScopedBlocks(
  user: AppUser,
  opts: { block?: string; vineyard?: string; variety?: string },
): Promise<ScopedBlock[]> {
  const where: Prisma.VineyardBlockWhereInput = {};
  if (!isTenantAdminLike(user)) {
    if (user.vineyardIds.length === 0) return [];
    where.vineyardId = { in: user.vineyardIds };
  }
  if (opts.vineyard) where.vineyard = { name: { contains: opts.vineyard, mode: "insensitive" } };
  if (opts.variety) where.variety = { name: { contains: opts.variety, mode: "insensitive" } };

  const rows = await prisma.vineyardBlock.findMany({
    where,
    take: 50,
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      blockLabel: true,
      vineyardId: true,
      vineyard: { select: { name: true } },
      variety: { select: { name: true } },
    },
  });

  let blocks: ScopedBlock[] = rows.map((b) => ({
    id: b.id,
    label: b.blockLabel ?? "(unlabeled)",
    vineyardId: b.vineyardId,
    vineyardName: b.vineyard.name,
    varietyName: b.variety?.name ?? null,
  }));

  // Fuzzy block filter in JS: match label OR variety, either direction.
  if (opts.block) {
    const needle = norm(opts.block);
    if (needle) {
      blocks = blocks.filter((b) => {
        const label = norm(b.label);
        const variety = b.varietyName ? norm(b.varietyName) : "";
        const hit = (hay: string) => hay !== "" && (hay === needle || hay.includes(needle) || needle.includes(hay));
        return hit(label) || hit(variety);
      });
    }
  }
  return blocks;
}

export type ResolvedVessel = Prisma.VesselGetPayload<{
  include: { components: { include: { variety: true; vineyard: true } } };
}>;

/**
 * Resolve a free-text vessel reference ("barrel 14", "tank 1") to the vessel,
 * with its components loaded for preview. Vessels are cellar equipment and are
 * NOT vineyard-scoped, so this is available to any ready user. Throws a clear,
 * model-relayable message when the reference is unparseable or unknown.
 */
/** Normalize a vessel code for tolerant matching: lowercase, strip non-alphanumerics. */
export const normVesselCode = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The normalized code candidates a free-text vessel reference should match, plus the parsed type. Winery
 * codes are "T3", "B1", "QBO-T1", "ZZ-COST-TANK"; a winemaker says "tank 3", "T3", "tank T3", "barrel 1".
 * So a reference matches on the NORMALIZED code, trying both the bare token ("3") and the type-lettered
 * form ("t3" for a tank, "b3" for a barrel) — that's what makes "tank 3" resolve to code "T3". A bare
 * "T3" (no type word) matches across all vessels by its normalized code. Pure (unit-testable).
 */
export function vesselCodeCandidates(text: string): { type: "TANK" | "BARREL" | null; wanted: string[] } {
  const ref = parseVesselRef(text);
  const raw = (ref?.code ?? text ?? "").trim();
  const wanted = new Set<string>([normVesselCode(raw)]);
  if (ref) wanted.add(normVesselCode(`${ref.type === "BARREL" ? "b" : "t"}${raw}`)); // "tank 3" → "t3"
  return { type: ref?.type ?? null, wanted: [...wanted].filter(Boolean) };
}

/** Resolve a free-text vessel reference to exactly one vessel id (flexible code match). */
async function matchVesselByText(text: string): Promise<{ id: string; type: string; code: string }> {
  const { type, wanted } = vesselCodeCandidates(text);
  const want = new Set(wanted);
  if (want.size === 0) throw new Error(`I couldn't tell which vessel "${text}" is. Use a code like "T3" or "barrel 14".`);
  const vessels = await prisma.vessel.findMany({
    where: type ? { type } : {},
    select: { id: true, type: true, code: true },
  });
  const hits = vessels.filter((v) => want.has(normVesselCode(v.code)));
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) throw new Error(`No vessel matches "${text}". Use its code, e.g. "T3", "barrel 14", or "QBO-T1".`);
  throw new Error(`Several vessels match "${text}": ${hits.map((h) => h.code).join(", ")}. Which one?`);
}

export async function resolveVessel(text: string): Promise<ResolvedVessel> {
  const m = await matchVesselByText(text);
  const vessel = await prisma.vessel.findUnique({
    where: { id: m.id },
    include: { components: { include: { variety: true, vineyard: true } } },
  });
  if (!vessel) throw new Error(`No ${m.type === "BARREL" ? "barrel" : "tank"} "${m.code}" exists.`);
  return vessel;
}

/**
 * What a vessel currently holds, for the assistant's "tank N and its history"
 * flow. Resolves against the authoritative `vesselLots` projection (the same
 * source the /vessels page links from), NOT the raw ledger. Returns the shape
 * so the tool can answer honestly: single lot -> offer to open it; blend ->
 * list each lot's link; empty -> point at the tanks list. Never picks one lot
 * out of a blend. Tenant-scoped automatically via the prisma extension (RLS);
 * vessels are cellar equipment and are not vineyard-bound.
 */
export type VesselContents =
  | { kind: "empty"; vesselId: string; vesselLabel: string }
  | { kind: "single"; vesselId: string; vesselLabel: string; lot: { id: string; code: string } }
  | { kind: "blend"; vesselId: string; vesselLabel: string; lots: { id: string; code: string }[] };

export async function resolveVesselContents(text: string): Promise<VesselContents> {
  const m = await matchVesselByText(text);
  const vessel = await prisma.vessel.findUnique({
    where: { id: m.id },
    select: {
      id: true,
      code: true,
      type: true,
      vesselLots: { include: { lot: { select: { id: true, code: true } } } },
    },
  });
  if (!vessel) {
    throw new Error(`No ${m.type === "BARREL" ? "barrel" : "tank"} "${m.code}" exists.`);
  }
  const label = `${vessel.type === "BARREL" ? "Barrel" : "Tank"} ${vessel.code}`;
  const lots = vessel.vesselLots.map((vl) => ({ id: vl.lot.id, code: vl.lot.code }));
  if (lots.length === 0) return { kind: "empty", vesselId: vessel.id, vesselLabel: label };
  if (lots.length === 1) return { kind: "single", vesselId: vessel.id, vesselLabel: label, lot: lots[0] };
  return { kind: "blend", vesselId: vessel.id, vesselLabel: label, lots };
}

/**
 * A candidate lot for attach-resolution, with an optional picker sublabel (a DISTINGUISHING detail so
 * co-resident lots are tell-apart-able — volume is the load-bearing differentiator per the design review).
 */
type LotCandidate = { id: string; code: string; detail?: string };

type LotResolution =
  | { kind: "one"; lot: LotCandidate }
  | { kind: "many"; lots: LotCandidate[]; ref: string; via: "lot" | "vessel"; vesselLabel?: string };

/**
 * SHARED resolution: a lot code OR a vessel reference → the candidate lot(s) + context. The two public
 * wrappers below (resolveLotTarget = throw on ambiguity; resolveLotTargetOrChoice = clickable picker)
 * differ ONLY in how they present ambiguity, so they can't drift. Measurements/tasting attach to exactly
 * one lot (the one-lot invariant, VISION D2), so a multi-lot vessel is genuinely ambiguous → we surface
 * every resident lot. Also handles the picker re-tap form "#<lotId>" (pins a lot by id, re-validated
 * ACTIVE so a stale tap fails cleanly instead of writing to a lot that was drawn down/merged since).
 */
async function resolveLotCandidates(opts: { lot?: string; vessel?: string }): Promise<LotResolution> {
  const lotRef = opts.lot?.trim();
  if (lotRef) {
    // A picker tap re-pins the lot by id ("#<lotId>"). Resolve exactly + prove still ACTIVE (stale guard).
    if (lotRef.startsWith("#")) {
      const pin = lotRef.slice(1).trim();
      const row = pin ? await prisma.lot.findUnique({ where: { id: pin }, select: { id: true, code: true, status: true } }) : null;
      if (!row || row.status !== "ACTIVE") throw new Error("That lot isn't available anymore — take the reading again.");
      return { kind: "one", lot: { id: row.id, code: row.code } };
    }
    const rows = await prisma.lot.findMany({
      where: { status: "ACTIVE", code: { contains: lotRef, mode: "insensitive" } },
      take: 10,
      select: { id: true, code: true },
    });
    const exact = rows.find((r) => r.code.toLowerCase() === lotRef.toLowerCase());
    if (exact) return { kind: "one", lot: { id: exact.id, code: exact.code } };
    if (rows.length === 1) return { kind: "one", lot: { id: rows[0].id, code: rows[0].code } };
    if (rows.length > 1) return { kind: "many", lots: rows.map((r) => ({ id: r.id, code: r.code })), ref: opts.lot!, via: "lot" };
    // Phase 1 (identity presentation) fallback: no current-code match — cross-identifier search
    // (displayName, historical codes via LotCodeEvent, legacy identifiers). Resolves to `id` first (NAMING-2).
    const { searchLotsByIdentifier } = await import("@/lib/lot/identify");
    const matches = await searchLotsByIdentifier(lotRef, { limit: 5 });
    if (matches.length === 1) return { kind: "one", lot: { id: matches[0].lotId, code: matches[0].currentCode } };
    if (matches.length > 1) {
      return {
        kind: "many",
        lots: matches.map((m) => ({ id: m.lotId, code: m.matchType === "current-code" ? m.currentCode : `${m.currentCode} (formerly ${m.matchContext})` })),
        ref: opts.lot!,
        via: "lot",
      };
    }
    throw new Error(`No active lot matches "${opts.lot}". Check the lot code, or name the vessel.`);
  }
  if (opts.vessel) {
    // A vessel holds ONE cohesive liquid (LEDGER-12), so naming a vessel names its wine. This used
    // to return a CHOICE of co-resident lots, plus a "float the lot with the most recent reading to
    // the top" hack that existed to stop a co-ferment's daily readings fragmenting across lots.
    // Both are gone with plan 088 — there is nothing left to choose between.
    const m = await matchVesselByText(opts.vessel);
    const vessel = await prisma.vessel.findUnique({
      where: { id: m.id },
      select: {
        code: true,
        type: true,
        vesselLots: {
          orderBy: { volumeL: "desc" }, // a pre-invariant row still resolves to the dominant wine
          include: { lot: { select: { id: true, code: true, vintageYear: true } } },
        },
      },
    });
    if (!vessel) throw new Error(`No ${m.type === "BARREL" ? "barrel" : "tank"} "${m.code}" exists.`);
    const label = `${vessel.type === "BARREL" ? "Barrel" : "Tank"} ${vessel.code}`;
    const resident = vessel.vesselLots[0];
    if (!resident) throw new Error(`${label} is empty — there's no wine to record a reading against.`);
    return { kind: "one", lot: { id: resident.lot.id, code: resident.lot.code } };
  }
  throw new Error("Which lot (or vessel) is this for?");
}

/**
 * Resolve the ONE lot a per-lot record (chem panel, tasting note) attaches to — from a lot code OR a
 * vessel reference. A VESSEL always resolves: it holds one cohesive liquid (LEDGER-12). Only an
 * ambiguous lot CODE can still be genuinely ambiguous, and that throws. For the clickable-picker
 * variant the assistant chat tools use, see resolveLotTargetOrChoice.
 */
export async function resolveLotTarget(opts: { lot?: string; vessel?: string }): Promise<{ lotId: string; lotCode: string }> {
  const r = await resolveLotCandidates(opts);
  if (r.kind === "one") return { lotId: r.lot.id, lotCode: r.lot.code };
  throw new Error(`Several lots match "${r.ref}": ${r.lots.map((l) => l.code).join(", ")}. Which one?`);
}

/**
 * Like resolveLotTarget, but an ambiguous lot CODE returns a clickable CHOICE (one option per
 * candidate, id-pinned via signResume) instead of a text dead-end. `toolName`/`resumeInput` re-drive
 * the SAME tool with the chosen lot pinned ("#<lotId>"), producing the tool's normal confirm-card
 * (never an auto-write).
 *
 * A VESSEL never reaches the choice branch any more (plan 088): it holds one wine, so naming a tank
 * resolves outright. The picker survives only for "several lots match 24-CS" — a real ambiguity in
 * what the winemaker TYPED, not an invented one about what is in the tank.
 */
export async function resolveLotTargetOrChoice(
  opts: { lot?: string; vessel?: string },
  toolName: string,
  resumeInput: Record<string, unknown>,
): Promise<ResolveResult<{ lotId: string; lotCode: string }>> {
  const r = await resolveLotCandidates(opts);
  if (r.kind === "one") return { kind: "one", row: { lotId: r.lot.id, lotCode: r.lot.code } };
  const res = resolveOneOrChoice(r.lots, {
    prompt: `Several lots match "${r.ref}" — which one did you sample?`,
    describe: (l) => l.code,
    detail: (l) => l.detail,
    // Re-pin the chosen lot by id and drop the vessel ref so the re-driven tool resolves the exact lot.
    resume: (l) => signResume(toolName, { ...resumeInput, lot: `#${l.id}`, vessel: undefined }),
    noneMsg: "There's no lot to attach this reading to.",
  });
  return res.kind === "one" ? { kind: "one", row: { lotId: res.row.id, lotCode: res.row.code } } : res;
}

export type ResolvedTask = { workOrderId: string; number: number; taskId: string; seq: number; title: string; opType: string | null; observationType: string | null; kind: string; status: string };

/**
 * Resolve the ledger operation to undo — an explicit id, or the most recent not-yet-corrected op on a
 * vessel/lot. Returns null (no explicit id) when nothing's found, so the tool can deep-link the timeline
 * instead of guessing. reverseOperationCore still fails closed (non-reversible type / downstream op), so
 * this only needs to surface a candidate + its summary for the confirm card.
 */
/** Map a free-text op word ("addition", "crush", "rack"…) to the ledger types it should scope undo to.
 *  Unknown/absent → undefined = no type filter (fall back to the single most-recent op). Scoping by type
 *  is a hard safety guard: "undo the last addition" must NEVER be able to resolve to a crush. */
export function opTypeFilter(word?: string): OperationType[] | undefined {
  const w = (word ?? "").trim().toLowerCase();
  if (!w) return undefined;
  const map: Record<string, OperationType[]> = {
    addition: ["ADDITION"], add: ["ADDITION"], dose: ["ADDITION", "FINING"], dosing: ["ADDITION", "FINING"],
    fining: ["FINING"], fine: ["FINING"],
    crush: ["CRUSH"], destem: ["CRUSH"], crushing: ["CRUSH"],
    press: ["PRESS"], pressing: ["PRESS"], saignee: ["SAIGNEE"],
    blend: ["BLEND"], blending: ["BLEND"],
    rack: ["RACK"], racking: ["RACK"], transfer: ["RACK"],
    bottling: ["BOTTLE"], bottle: ["BOTTLE"],
    topping: ["TOPPING"], top: ["TOPPING"],
    filtration: ["FILTRATION"], filter: ["FILTRATION"],
    cap: ["CAP_MGMT"], punchdown: ["CAP_MGMT"], pumpover: ["CAP_MGMT"],
  };
  return map[w];
}

export async function resolveRecentOperation(opts: { operationId?: number; vessel?: string; lot?: string; opType?: string }): Promise<{ operationId: number; lotId: string; summary: string } | null> {
  const summarize = (op: { id: number; type: string; note: string | null; createdAt: Date }) =>
    `#${op.id} ${op.type}${op.note ? ` — ${op.note}` : ""} (${op.createdAt.toISOString().slice(0, 10)})`;
  const lotOf = (op: { lines: { lotId: string }[]; treatments: { lotId: string }[] }) => op.lines[0]?.lotId ?? op.treatments[0]?.lotId ?? "";
  // Neutral ops (ADDITION/FINING/CAP_MGMT) carry NO volumetric lines — they attach to the resident lot
  // via `treatments`. Selecting BOTH is what makes a dose visible to undo (keying on lines alone made undo
  // silently target the crush instead of the addition).
  const opSelect = { id: true, type: true, note: true, createdAt: true, lines: { select: { lotId: true }, take: 1 }, treatments: { select: { lotId: true }, take: 1 } } as const;

  if (opts.operationId != null) {
    const op = await prisma.lotOperation.findUnique({ where: { id: opts.operationId }, select: { ...opSelect, correctedBy: { select: { id: true } } } });
    if (!op) throw new Error(`No operation #${opts.operationId} exists.`);
    if (op.correctedBy) throw new Error(`Operation #${op.id} was already reversed.`);
    return { operationId: op.id, lotId: lotOf(op), summary: summarize(op) };
  }

  // Scope to the resident lot(s), then match ops through EITHER lines OR treatments so neutral doses count.
  let lotIds: string[] = [];
  if (opts.lot) lotIds = [(await resolveLotTarget({ lot: opts.lot })).lotId];
  else if (opts.vessel) {
    const c = await resolveVesselContents(opts.vessel);
    lotIds = c.kind === "single" ? [c.lot.id] : c.kind === "blend" ? c.lots.map((l) => l.id) : [];
  } else throw new Error("Undo which operation? Give a vessel, a lot, or an operation number.");
  if (lotIds.length === 0) return null; // empty vessel → nothing to undo (tool deep-links the timeline)

  const types = opTypeFilter(opts.opType);
  const op = await prisma.lotOperation.findFirst({
    where: {
      correctedBy: null,
      // With a type word, scope to it; without, never auto-surface a CORRECTION (it's a reversal — the
      // core refuses to reverse it anyway, so offering it would just dead-end the confirm).
      type: types ? { in: types } : { not: "CORRECTION" },
      OR: [{ lines: { some: { lotId: { in: lotIds } } } }, { treatments: { some: { lotId: { in: lotIds } } } }],
    },
    orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    select: opSelect,
  });
  return op ? { operationId: op.id, lotId: lotOf(op), summary: summarize(op) } : null;
}

/** Statuses a lab sample can still be acted on (send / attach results / cancel). Mirror of
 *  samples.ts NON_TERMINAL_STATUSES — inlined so scope.ts doesn't pull the sample cores. */
const OPEN_SAMPLE_STATUSES = ["PULLED", "SENT", "PENDING", "RESULT_RETURNED"] as const;

/**
 * Resolve the lab sample to act on: an explicit id, or the most-recent STILL-OPEN sample on a lot/vessel
 * (a vessel resolves to its one lot via resolveLotTarget). Terminal samples (attached/cancelled) are ignored.
 * Nothing open → a clear error telling the operator to pull one first.
 */
export async function resolveOpenSample(
  opts: { sampleId?: string; vessel?: string; lot?: string },
  toolName: string,
  resumeInput: Record<string, unknown>,
): Promise<ResolveResult<{ sampleId: string; lotId: string; lotCode: string; status: string; source: string | null }>> {
  const shape = { id: true, lotId: true, status: true, source: true, lot: { select: { code: true } } } as const;
  if (opts.sampleId) {
    const s = await prisma.sample.findUnique({ where: { id: opts.sampleId }, select: shape });
    if (!s) throw new Error(`No sample "${opts.sampleId}" exists.`);
    return { kind: "one", row: { sampleId: s.id, lotId: s.lotId, lotCode: s.lot.code, status: s.status, source: s.source } };
  }
  if (!opts.lot && !opts.vessel) throw new Error("Which sample? Give a vessel, a lot, or a sample id.");
  // A vessel resolves to its one wine. The choice branch survives only for an ambiguous lot CODE
  // ("several lots match 24-CS"), which re-drives this tool with the chosen lot pinned.
  const resolved = await resolveLotTargetOrChoice({ lot: opts.lot, vessel: opts.vessel }, toolName, resumeInput);
  if (resolved.kind === "choice") return resolved;
  const { lotId, lotCode } = resolved.row;
  const s = await prisma.sample.findFirst({
    where: { lotId, status: { in: [...OPEN_SAMPLE_STATUSES] } },
    orderBy: { pulledAt: "desc" },
    select: shape,
  });
  if (!s) throw new Error(`No open sample on lot ${lotCode} — pull one first.`);
  return { kind: "one", row: { sampleId: s.id, lotId: s.lotId, lotCode: s.lot.code, status: s.status, source: s.source } };
}

/** A parsed work-order reference: pinned either by database id (cuid) or by human number. */
type WorkOrderRef = { id: string } | { number: number };

/** A Prisma cuid: starts with 'c', then a run of lowercase-alnum. Used to tell an id from a number. */
function looksLikeWorkOrderId(s: string): boolean {
  return /^c[a-z0-9]{20,}$/i.test(s);
}

/**
 * Parse whatever the assistant hands us for a work order — a human number (`142`, `"WO 142"`, `"#142"`),
 * a database id (the cuid the create/issue tools return + the app URLs use), or an in-app URL/path
 * (`…/work-orders/<id>/execute`). Returns whichever we can pin, or null. CRITICAL: an id is detected
 * BEFORE the digit fallback — otherwise `\d+` would pluck a stray digit out of a cuid (e.g. `cmr8…` → 8)
 * and silently resolve the WRONG work order.
 */
export function parseWorkOrderRef(ref: string | number): WorkOrderRef | null {
  if (typeof ref === "number") return Number.isFinite(ref) ? { number: ref } : null;
  const s = ref?.trim();
  if (!s) return null;
  const urlMatch = s.match(/work-orders\/([^/?#\s]+)/i); // a link/path: …/work-orders/<id>/…
  if (urlMatch && looksLikeWorkOrderId(urlMatch[1])) return { id: urlMatch[1] };
  if (looksLikeWorkOrderId(s)) return { id: s }; // a bare id pasted on its own
  const m = s.match(/\d+/); // fall back to a human number embedded in the text
  return m ? { number: Number(m[0]) } : null;
}

const NEED_WO = "Which work order? Give its number (e.g. 'WO 142'), its id, or its link.";
const NEED_WO_OR_VESSEL =
  "Which work order? Give its number (e.g. 'WO 142'), its id/link, or name the vessel it's on (e.g. 'tank 1').";

const DEFAULT_OPEN_STATES: WorkOrderTaskStatus[] = ["PENDING", "IN_PROGRESS", "REJECTED"];

/**
 * Resolve an open work-order task from a VESSEL reference alone — the "complete the punchdown on tank 1"
 * flow, where the operator never cites a WO number. Tasks mirror their target vessel into the canonical
 * `sourceVesselId`/`destVesselId` columns at issue time (template-vocabulary `canonicalColumns`), so we
 * match on either. Scoped to still-open tasks and tenant-isolated via the prisma extension (RLS). When a
 * task word is given ("punchdown"), it narrows by title fuzzy-match first, then by the op family the word
 * maps to (so "punchdown" → CAP_MGMT even if the title reads "Cap management"). Ambiguity lists the open
 * tasks (WO # + title) so the model can ask; nothing open throws a clear message.
 */
async function resolveTaskByVessel(vesselText: string, opts: { task?: string | number; states?: string[] }): Promise<ResolvedTask> {
  const v = await matchVesselByText(vesselText); // throws a relayable message when unknown/ambiguous
  const label = `${v.type === "BARREL" ? "Barrel" : "Tank"} ${v.code}`;
  const states = (opts.states as WorkOrderTaskStatus[] | undefined) ?? DEFAULT_OPEN_STATES;
  const rows = await prisma.workOrderTask.findMany({
    where: { status: { in: states }, OR: [{ sourceVesselId: v.id }, { destVesselId: v.id }] },
    orderBy: [{ dueAt: "asc" }, { seq: "asc" }],
    select: { id: true, seq: true, title: true, opType: true, observationType: true, kind: true, status: true, workOrder: { select: { id: true, number: true } } },
  });

  type Row = (typeof rows)[number];
  const pick = (t: Row): ResolvedTask => ({ workOrderId: t.workOrder.id, number: t.workOrder.number, taskId: t.id, seq: t.seq, title: t.title, opType: t.opType, observationType: t.observationType, kind: t.kind, status: t.status });
  const describe = (t: Row) => `WO #${t.workOrder.number} · #${t.seq} ${t.title} (${t.status.toLowerCase()})`;

  let candidates = rows;
  const ref = opts.task;
  if (ref != null && String(ref).trim() !== "") {
    const needle = norm(String(ref));
    let matched = needle ? rows.filter((t) => norm(t.title).includes(needle)) : [];
    if (matched.length === 0) {
      const types = opTypeFilter(String(ref)); // "punchdown" → CAP_MGMT, "rack" → RACK, …
      if (types) matched = rows.filter((t) => t.opType != null && types.includes(t.opType as OperationType));
    }
    candidates = matched;
  }

  if (candidates.length === 1) return pick(candidates[0]);
  if (candidates.length === 0) {
    if (rows.length === 0) throw new Error(`No open work-order task on ${label}.`);
    throw new Error(`No open task matching "${opts.task}" on ${label}. Open tasks: ${rows.map(describe).join("; ")}.`);
  }
  throw new Error(`${label} has several open tasks — which one? ${candidates.map(describe).join("; ")}.`);
}

/** Resolve a work order by number, id, or URL (for WO-level lifecycle actions that don't need a task). */
export async function resolveWorkOrder(ref: string | number): Promise<{ workOrderId: string; number: number; status: string }> {
  const parsed = parseWorkOrderRef(ref);
  if (!parsed) throw new Error(NEED_WO);
  const wo = await prisma.workOrder.findFirst({
    where: "id" in parsed ? { id: parsed.id } : { number: parsed.number },
    select: { id: true, number: true, status: true },
  });
  if (!wo) throw new Error("id" in parsed ? "No work order matches that id/link." : `No work order #${parsed.number} exists.`);
  return { workOrderId: wo.id, number: wo.number, status: wo.status };
}

/**
 * Resolve a work order by its human number + (optionally) a task within it by seq number or a fuzzy
 * title match. When the WO has exactly one still-open task and none was named, that task is used; when
 * it's ambiguous, we throw a message listing the open tasks so the model can ask. Tenant-scoped via the
 * prisma extension (RLS). Used by the assistant WO-execution tools (complete/approve/…).
 */
export async function resolveWorkOrderTask(opts: { wo?: string | number; task?: string | number; vessel?: string; states?: string[] }): Promise<ResolvedTask> {
  const parsed = opts.wo == null || opts.wo === "" ? null : parseWorkOrderRef(opts.wo);
  if (!parsed) {
    // No WO number — resolve by the vessel it's on instead ("complete the punchdown on tank 1").
    if (opts.vessel && opts.vessel.trim()) return resolveTaskByVessel(opts.vessel, { task: opts.task, states: opts.states });
    throw new Error(NEED_WO_OR_VESSEL);
  }
  const wo = await prisma.workOrder.findFirst({
    where: "id" in parsed ? { id: parsed.id } : { number: parsed.number },
    select: { id: true, number: true, tasks: { orderBy: { seq: "asc" }, select: { id: true, seq: true, title: true, opType: true, observationType: true, kind: true, status: true } } },
  });
  if (!wo) throw new Error("id" in parsed ? "No work order matches that id/link." : `No work order #${parsed.number} exists.`);
  const num = wo.number;
  if (wo.tasks.length === 0) throw new Error(`Work order #${num} has no tasks.`);

  const OPEN = new Set(opts.states ?? ["PENDING", "IN_PROGRESS", "REJECTED"]);
  const pick = (t: (typeof wo.tasks)[number]): ResolvedTask => ({ workOrderId: wo.id, number: wo.number, taskId: t.id, seq: t.seq, title: t.title, opType: t.opType, observationType: t.observationType, kind: t.kind, status: t.status });
  const describe = (t: (typeof wo.tasks)[number]) => `#${t.seq} ${t.title} (${t.status.toLowerCase()})`;

  const ref = opts.task;
  if (ref != null && String(ref).trim() !== "") {
    const asSeq = typeof ref === "number" ? ref : /^\d+$/.test(String(ref).trim()) ? Number(String(ref).trim()) : null;
    let matches = asSeq != null ? wo.tasks.filter((t) => t.seq === asSeq) : [];
    if (matches.length === 0) {
      const needle = norm(String(ref));
      matches = wo.tasks.filter((t) => needle && norm(t.title).includes(needle));
    }
    if (matches.length === 0) throw new Error(`No task "${ref}" on WO #${num}. Tasks: ${wo.tasks.map(describe).join("; ")}.`);
    if (matches.length > 1) throw new Error(`Several tasks match "${ref}" on WO #${num}: ${matches.map(describe).join("; ")}. Which one?`);
    return pick(matches[0]);
  }

  const open = wo.tasks.filter((t) => OPEN.has(t.status));
  if (open.length === 1) return pick(open[0]);
  if (open.length === 0) throw new Error(`WO #${num} has no matching tasks. Tasks: ${wo.tasks.map(describe).join("; ")}.`);
  throw new Error(`WO #${num} has several matching tasks — which one? ${open.map(describe).join("; ")}.`);
}
