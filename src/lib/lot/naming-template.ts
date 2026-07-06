import type { Prisma, PrismaClient } from "@prisma/client";
import { buildLotCode, buildBlendLotCode, type LotCodeParts, type BlendLotCodeParts } from "@/lib/lot/code";

// Phase 1 (identity presentation) — the per-tenant, versioned tokenized naming scheme (plan C1).
// Today's hardcoded `buildLotCode`/`buildBlendLotCode` become the DEFAULT template's renderer:
// the built-in default spec (kind "builtin-default") delegates to them so output is byte-for-byte
// identical (plan Q6, parity by construction). A CUSTOM template evaluates its ordered token spec.
// The blend anti-single-origin rule is preserved as a template CONSTRAINT (a blend spec must not
// carry origin tokens) rather than a hardcode.
//
// No DB writes here. `getActiveTemplateSpec` reads the tenant's active default; if the tenant can't
// be resolved or has no row, it falls back to the built-in default (== today's behavior) — so a
// missing template never changes output and never leaks another tenant's scheme.

type Db = PrismaClient | Prisma.TransactionClient;

export const ORIGIN_TOKENS = ["VINEYARD", "BLOCK", "SUBBLOCK", "VARIETY"] as const;
export const LOT_TOKENS = ["VINTAGE", ...ORIGIN_TOKENS, "FRACTION"] as const;
export type LotToken = (typeof LOT_TOKENS)[number];

/** One ordered segment of a naming pattern: a resolved attribute token or a static literal. */
export type NamingSegment = { token: LotToken } | { literal: string };

/**
 * A tenant naming template's spec (stored as `NamingTemplateVersion.spec` JSON).
 *  - `builtin-default`: reproduces today's scheme; the renderer delegates to buildLotCode.
 *  - `custom`: an ordered `lot` segment list + separator; `isBlend` forbids origin tokens.
 */
export type NamingTemplateSpec =
  | { kind: "builtin-default"; engineVersion: number }
  | {
      kind: "custom";
      engineVersion: number;
      lot: NamingSegment[];
      separator?: string;
      isBlend?: boolean;
    };

export const BUILTIN_DEFAULT_SPEC: NamingTemplateSpec = { kind: "builtin-default", engineVersion: 1 };

/** True if a custom spec references any origin token (used by the blend anti-single-origin guard). */
export function specReferencesOriginToken(spec: NamingTemplateSpec): boolean {
  if (spec.kind !== "custom") return false;
  return spec.lot.some((s) => "token" in s && (ORIGIN_TOKENS as readonly string[]).includes(s.token));
}

/**
 * Validate a spec at authoring time (plan U1 / council G8): a blend template must NOT carry origin
 * tokens (that is the no-false-single-origin rule, now a template constraint). Throws DomainError-style.
 */
export function assertValidTemplateSpec(spec: NamingTemplateSpec): void {
  if (spec.kind === "custom" && spec.isBlend && specReferencesOriginToken(spec)) {
    throw new Error(
      "A blend naming template must not use origin tokens (VINEYARD/BLOCK/SUBBLOCK/VARIETY) — a blend " +
        "must not masquerade as single-origin.",
    );
  }
}

function resolveToken(token: LotToken, parts: LotCodeParts): string {
  switch (token) {
    case "VINTAGE":
      return parts.vintage != null && Number.isFinite(parts.vintage) ? String(parts.vintage) : "";
    case "VINEYARD":
      return parts.vineyardAbbr ?? "";
    case "VARIETY":
      return parts.varietyAbbr ?? "";
    case "BLOCK":
      return parts.blockToken ?? "";
    case "SUBBLOCK":
      return parts.subblockToken ?? "";
    case "FRACTION":
      return parts.tag ?? "";
  }
}

/**
 * Render a lot's base code from a template spec + parts. The built-in default delegates to
 * `buildLotCode` (byte-for-byte parity). A custom spec joins its resolved segments, dropping empties.
 */
export function renderLotCode(spec: NamingTemplateSpec, parts: LotCodeParts): string {
  if (spec.kind === "builtin-default") return buildLotCode(parts);
  const sep = spec.separator ?? "-";
  const rendered = spec.lot
    .map((seg) => ("literal" in seg ? seg.literal : resolveToken(seg.token, parts)))
    .map((s) => String(s ?? "").trim())
    .filter((s) => s.length > 0);
  if (rendered.length === 0) throw new Error("Naming template produced an empty code.");
  return rendered.join(sep);
}

/**
 * Render a BLEND code. The built-in default delegates to `buildBlendLotCode` (`[vintage]-BL-<TOKEN>`,
 * origin-free by construction). A custom blend template is validated origin-free (assertValidTemplateSpec).
 */
export function renderBlendLotCode(spec: NamingTemplateSpec, parts: BlendLotCodeParts): string {
  if (spec.kind === "builtin-default") return buildBlendLotCode(parts);
  assertValidTemplateSpec(spec);
  // Custom blend templates resolve VINTAGE + literals only (origin tokens are rejected above).
  const lotParts: LotCodeParts = {
    vintage: parts.vintage ?? NaN,
    vineyardAbbr: "",
    varietyAbbr: "",
    tag: parts.token,
  };
  const sep = spec.kind === "custom" ? spec.separator ?? "-" : "-";
  if (spec.kind !== "custom") return buildBlendLotCode(parts);
  const rendered = spec.lot
    .map((seg) => {
      if ("literal" in seg) return seg.literal;
      if (seg.token === "VINTAGE") return resolveToken("VINTAGE", lotParts) || "NV";
      if (seg.token === "FRACTION") return parts.token;
      return "";
    })
    .map((s) => String(s ?? "").trim())
    .filter((s) => s.length > 0);
  return rendered.join(sep);
}

/**
 * Resolve the tenant's active naming spec. Reads the tenant's default (isDefault, not archived);
 * falls back to the built-in default when the tenant can't be resolved or has no row — so output
 * never changes and never leaks across tenants. Uses the passed db (RLS/extension-scoped) and an
 * explicit tenantId filter (defense-in-depth) when a tenant is in scope.
 */
export async function getActiveTemplateSpec(db: Db): Promise<NamingTemplateSpec> {
  let tenantId: string | undefined;
  try {
    // Local import avoids a hard dependency when called from a context with no ALS tenant.
    const { requireTenantId } = await import("@/lib/tenant/context");
    tenantId = requireTenantId();
  } catch {
    return BUILTIN_DEFAULT_SPEC;
  }
  const tpl = await db.namingTemplate.findFirst({
    where: { tenantId, isDefault: true, archivedAt: null },
    select: { id: true, currentVersion: true },
  });
  if (!tpl) return BUILTIN_DEFAULT_SPEC;
  const version = await db.namingTemplateVersion.findFirst({
    where: { tenantId, templateId: tpl.id, version: tpl.currentVersion },
    select: { spec: true },
  });
  const spec = version?.spec as unknown as NamingTemplateSpec | undefined;
  if (!spec || (spec.kind !== "builtin-default" && spec.kind !== "custom")) return BUILTIN_DEFAULT_SPEC;
  return spec;
}
