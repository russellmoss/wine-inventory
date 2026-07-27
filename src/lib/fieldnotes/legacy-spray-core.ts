// Spray Intelligence S3a — the legacy field-note read seam (KD-9 / council S11). NEW FILE ONLY:
// S4 is working in this directory, so this module touches nothing existing — it takes
// already-parsed InputApplication[] (S4-agnostic) plus mapping rows and returns
// LegacySprayRecord[]. Pure: no Prisma, no I/O.
//
// The honesty contract: an old name-only spray is a LOW-CONFIDENCE RECORD, NOT AN ABSENCE —
// treating it as nothing would make S6 report full protection. Even a CONFIRMED mapping stays
// confidence LOW: a field note is week-bucketed with no timestamp and no rate, so it can seed the
// ROTATION budget with a product identity but can never feed the RESIDUAL model. An unconfirmed
// record contributes UNKNOWN, which BLOCKS a rotation-OK claim rather than granting one.

import type { InputApplication } from "./types";
import { normalizeInputKey } from "./sanitize";

export type LegacyRotationContribution = { groups: string[] } | { unknown: true; reason: string };

export interface LegacyMappingInput {
  normalizedName: string;
  status: "SUGGESTED" | "CONFIRMED" | "REJECTED";
  epaRegistrationNumber: string | null;
  productName: string | null;
  /** Resolved by the caller (via the facts port) for a CONFIRMED mapping; null = not resolved. */
  resistanceGroups?: string[] | null;
}

export interface LegacySprayNote {
  /** ISO YYYY-MM-DD week anchor of the field note. */
  weekOf: string;
  vineyardId: string;
  sprays: InputApplication[];
}

export interface LegacySprayRecord {
  displayName: string;
  normalizedName: string;
  weekOf: string;
  vineyardId: string;
  scope: InputApplication["scope"];
  blockIds: string[];
  confidence: "LOW";
  productIdentity: { epaRegistrationNumber: string | null; productName: string | null } | null;
  rotationContribution: LegacyRotationContribution;
  usableFor: { rotation: boolean; residual: false; compliance: false };
}

/**
 * Surface every legacy SPRAY entry as a low-confidence record. A SUGGESTED-but-unconfirmed
 * mapping is treated exactly like no mapping (a human has not asserted it — rule §3.2).
 */
export function legacySprayRecords(
  notes: LegacySprayNote[],
  mappings: LegacyMappingInput[],
): LegacySprayRecord[] {
  const confirmed = new Map(mappings.filter((m) => m.status === "CONFIRMED").map((m) => [m.normalizedName, m]));
  const records: LegacySprayRecord[] = [];
  for (const note of notes) {
    for (const spray of note.sprays) {
      let normalizedName: string;
      try {
        normalizedName = normalizeInputKey(spray.name);
      } catch {
        continue; // unusable name — nothing to key on
      }
      const mapping = confirmed.get(normalizedName) ?? null;
      const groups = mapping?.resistanceGroups ?? null;
      records.push({
        displayName: spray.name,
        normalizedName,
        weekOf: note.weekOf,
        vineyardId: note.vineyardId,
        scope: spray.scope,
        blockIds: [...spray.blockIds],
        confidence: "LOW",
        productIdentity: mapping
          ? { epaRegistrationNumber: mapping.epaRegistrationNumber, productName: mapping.productName }
          : null,
        rotationContribution:
          mapping && groups && groups.length > 0
            ? { groups: [...groups] }
            : {
                unknown: true,
                reason: mapping
                  ? `"${spray.name}" is mapped but its resistance groups are not resolved — unknown blocks a rotation-OK claim.`
                  : `"${spray.name}" has no CONFIRMED product mapping — unknown blocks a rotation-OK claim.`,
              },
        usableFor: {
          // Identity confirmed by a human → usable for rotation IDENTITY; never residual/compliance
          // (a week bucket has no application instant and no rate).
          rotation: mapping != null,
          residual: false,
          compliance: false,
        },
      });
    }
  }
  return records;
}
