// Spray Intelligence S3a — legacy name→product mapping (KD-9 / council S11). Suggestion is a
// DETERMINISTIC exact-normalized-key match — never an LLM, never a fuzzy score (rule §3.2). A
// human confirms; the confirmation is attributed. Unconfirmed = unknown downstream.
//
// suggestLegacyMappings is pure; the *Core functions touch the DB (script-safe: no "use server",
// no next/cache) and are registered INTERNAL in scripts/ai-native-allowlist.mjs until the S11
// write tool lands.

import "server-only";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { writeAudit } from "@/lib/audit";
import type { SprayActor } from "./types";

export interface LegacyMappingSuggestion {
  normalizedName: string;
  displayName: string;
  epaRegistrationNumber: string | null;
  productName: string;
  /** The deterministic rule that produced this suggestion — recorded, never an LLM. */
  suggestionBasis: "EXACT_NORMALIZED_NAME_MATCH";
}

/** Strip non-alphanumerics + UPPERCASE — the same shape as fieldnotes' normalizeInputKey,
 * re-declared locally so the spray family does not import across families. */
export function normalizeLegacyName(raw: string): string | null {
  const key = String(raw ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  return key || null;
}

/**
 * Deterministic suggester: a legacy name suggests a catalog product only on an EXACT normalized
 * key match. No partial-string match, no similarity score, ever.
 */
export function suggestLegacyMappings(
  names: string[],
  catalog: { epaRegistrationNumber: string | null; productName: string }[],
): LegacyMappingSuggestion[] {
  const byKey = new Map<string, { epaRegistrationNumber: string | null; productName: string }>();
  for (const product of catalog) {
    const key = normalizeLegacyName(product.productName);
    if (key && !byKey.has(key)) byKey.set(key, product);
  }
  const suggestions: LegacyMappingSuggestion[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = normalizeLegacyName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const hit = byKey.get(key);
    if (hit) {
      suggestions.push({
        normalizedName: key,
        displayName: name,
        epaRegistrationNumber: hit.epaRegistrationNumber,
        productName: hit.productName,
        suggestionBasis: "EXACT_NORMALIZED_NAME_MATCH",
      });
    }
  }
  return suggestions;
}

/** Persist a suggestion (status SUGGESTED) — idempotent on (tenantId, normalizedName). */
export async function recordLegacyMappingSuggestionCore(suggestion: LegacyMappingSuggestion) {
  return runInTenantTx(async (tx) => {
    return tx.legacySprayMapping.upsert({
      where: { tenantId_normalizedName: { tenantId: requireTenantId(), normalizedName: suggestion.normalizedName } },
      update: {},
      create: {
        normalizedName: suggestion.normalizedName,
        displayName: suggestion.displayName,
        epaRegistrationNumber: suggestion.epaRegistrationNumber,
        productName: suggestion.productName,
        status: "SUGGESTED",
        suggestionBasis: suggestion.suggestionBasis,
      },
    });
  });
}

/** The human gate (rule §3.2): a person asserts the mapping, attributed and audited. */
export async function confirmLegacyMappingCore(
  actor: SprayActor,
  input: {
    normalizedName: string;
    displayName: string;
    epaRegistrationNumber?: string | null;
    productName: string;
    note?: string | null;
  },
) {
  return runInTenantTx(async (tx) => {
    const now = new Date();
    const row = await tx.legacySprayMapping.upsert({
      where: { tenantId_normalizedName: { tenantId: requireTenantId(), normalizedName: input.normalizedName } },
      update: {
        status: "CONFIRMED",
        displayName: input.displayName,
        epaRegistrationNumber: input.epaRegistrationNumber ?? null,
        productName: input.productName,
        confirmedById: actor.userId,
        confirmedByEmail: actor.email,
        confirmedAt: now,
        note: input.note ?? null,
      },
      create: {
        normalizedName: input.normalizedName,
        displayName: input.displayName,
        epaRegistrationNumber: input.epaRegistrationNumber ?? null,
        productName: input.productName,
        status: "CONFIRMED",
        suggestionBasis: "HUMAN_CONFIRMED_DIRECT",
        confirmedById: actor.userId,
        confirmedByEmail: actor.email,
        confirmedAt: now,
        note: input.note ?? null,
      },
    });
    await writeAudit(tx, {
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: "UPDATE",
      entityType: "legacy_spray_mapping",
      entityId: row.id,
      summary: `Confirmed legacy spray mapping "${input.displayName}" → ${input.productName}${input.epaRegistrationNumber ? ` (EPA ${input.epaRegistrationNumber})` : ""}.`,
    });
    return row;
  });
}

/** Reject a suggestion — the name stays unmapped (unknown downstream), attributed and audited. */
export async function rejectLegacyMappingCore(actor: SprayActor, normalizedName: string, note?: string | null) {
  return runInTenantTx(async (tx) => {
    const row = await tx.legacySprayMapping.update({
      where: { tenantId_normalizedName: { tenantId: requireTenantId(), normalizedName } },
      data: { status: "REJECTED", confirmedById: actor.userId, confirmedByEmail: actor.email, confirmedAt: new Date(), note: note ?? null },
    });
    await writeAudit(tx, {
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: "UPDATE",
      entityType: "legacy_spray_mapping",
      entityId: row.id,
      summary: `Rejected legacy spray mapping suggestion "${row.displayName}".`,
    });
    return row;
  });
}
