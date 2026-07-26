import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { GLOBAL_MODELS } from "@/lib/tenant/models";

// Spray S2 Unit 1 — schema shape guard (the commerce7-schema.test.ts pattern). The pesticide master is
// GLOBAL reference data whose safety contracts live in the DB: this test fails if a model goes missing,
// if any of the three GLOBAL_MODELS sync points drifts, or if a hand-added CHECK / partial unique is
// dropped from the migration SQL. Pure, DB-free.

const PESTICIDE_MODELS = [
  "PesticideDataRevision",
  "PesticideProduct",
  "PesticideActiveIngredient",
  "PesticideProductIngredient",
  "PesticideSiteRegistration",
  "PesticideStateRegistration",
  "PesticideUseRestriction",
  "PesticideResistanceAssignment",
] as const;

const MIGRATION_SQL = readFileSync(
  join(__dirname, "..", "prisma", "migrations", "20260726220000_pesticide_schema", "migration.sql"),
  "utf8",
);

describe("pesticide schema (Spray S2 Unit 1)", () => {
  it("all eight models exist in the datamodel and none is tenant-scoped (global posture)", () => {
    for (const name of PESTICIDE_MODELS) {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === name);
      expect(model, `${name} exists in the datamodel`).toBeTruthy();
      const fieldNames = (model?.fields ?? []).map((f) => f.name);
      expect(fieldNames, `${name} must NOT carry tenantId — it is global reference data`).not.toContain("tenantId");
    }
  });

  it("all eight models are in GLOBAL_MODELS (sync point 1: src/lib/tenant/models.ts)", () => {
    for (const name of PESTICIDE_MODELS) {
      expect(GLOBAL_MODELS.has(name), `${name} in GLOBAL_MODELS`).toBe(true);
    }
  });

  it("the verify-tenant-isolation.ts inlined mirror lists all eight (sync point 2)", () => {
    const src = readFileSync(join(__dirname, "..", "scripts", "verify-tenant-isolation.ts"), "utf8");
    for (const name of PESTICIDE_MODELS) {
      expect(src.includes(`"${name}"`), `${name} in scripts/verify-tenant-isolation.ts GLOBAL_MODELS`).toBe(true);
    }
  });

  it("the tenant-context test's hard-coded expected set lists all eight (sync point 3)", () => {
    const src = readFileSync(join(__dirname, "tenant-context.test.ts"), "utf8");
    for (const name of PESTICIDE_MODELS) {
      expect(src.includes(`"${name}"`), `${name} in test/tenant-context.test.ts expected set`).toBe(true);
    }
  });

  it("the hand-added CHECK constraints are present in the migration SQL (K2/K4/G4)", () => {
    // (K2) CODED ⟺ non-empty codes — gap is not a clearance, at the schema.
    expect(MIGRATION_SQL).toContain('"chk_pra_coded_has_codes"');
    expect(MIGRATION_SQL).toContain(`("resolution" = 'CODED') = (cardinality("codes") > 0)`);
    // exactly one subject, matching subjectKind
    expect(MIGRATION_SQL).toContain('"chk_pra_subject_exactly_one"');
    // (K4) the Switch guard — a PRODUCT row can never come from an AI-keyed table.
    expect(MIGRATION_SQL).toContain('"chk_pra_product_not_ai_keyed"');
    expect(MIGRATION_SQL).toContain(`NOT ("subjectKind" = 'PRODUCT' AND "derivedFrom" = 'AI_KEYED_TABLE')`);
    // (G4) at least one registration number — adjuvants/25(b) stay representable.
    expect(MIGRATION_SQL).toContain('"chk_product_has_reg_number"');
    expect(MIGRATION_SQL).toContain(`"epaRegNumber" IS NOT NULL OR "caRegNumber" IS NOT NULL`);
  });

  it("the partial unique indexes are present in the migration SQL (C3 — NULLs are distinct)", () => {
    for (const idx of [
      `"pesticide_product_epaRegNumber_key" ON "pesticide_product"("epaRegNumber") WHERE "epaRegNumber" IS NOT NULL`,
      `"pesticide_product_caRegNumber_key" ON "pesticide_product"("caRegNumber") WHERE "caRegNumber" IS NOT NULL`,
      `"pesticide_active_ingredient_pcCode_key" ON "pesticide_active_ingredient"("pcCode") WHERE "pcCode" IS NOT NULL`,
      `"pra_ai_scheme_key" ON "pesticide_resistance_assignment"("activeIngredientId", "scheme") WHERE "subjectKind" = 'ACTIVE_INGREDIENT'`,
      `"pra_product_scheme_key" ON "pesticide_resistance_assignment"("productId", "scheme") WHERE "subjectKind" = 'PRODUCT'`,
    ]) {
      expect(MIGRATION_SQL.includes(`CREATE UNIQUE INDEX ${idx}`), `partial unique: ${idx}`).toBe(true);
    }
  });

  it("read-path and sweep indexes are present (C9/K14)", () => {
    for (const idx of [
      `"pesticide_state_registration_productId_state_idx"`,
      `"pesticide_use_restriction_productId_state_idx"`,
      `"pesticide_product_lastSeenRevisionId_idx"`,
      `"pesticide_site_registration_lastSeenRevisionId_idx"`,
      `"pesticide_state_registration_lastSeenRevisionId_idx"`,
      `"pesticide_use_restriction_lastSeenRevisionId_idx"`,
      `"pesticide_active_ingredient_normalizedName_idx"`,
      `"pesticide_active_ingredient_parentActiveIngredientId_idx"`,
    ]) {
      expect(MIGRATION_SQL.includes(idx), `index: ${idx}`).toBe(true);
    }
  });

  it("required safety fields are non-nullable in the datamodel (K3/K11/K14)", () => {
    const field = (model: string, name: string) =>
      Prisma.dmmf.datamodel.models.find((m) => m.name === model)?.fields.find((f) => f.name === name);
    // K3: siteType is required — rotation engines key off it, not code presence.
    expect(field("PesticideResistanceAssignment", "siteType")?.isRequired).toBe(true);
    // K2: resolution is required tri-state.
    expect(field("PesticideResistanceAssignment", "resolution")?.isRequired).toBe(true);
    // K11: siteModifier is required with UNSPECIFIED default (never silently BEARING).
    const mod = field("PesticideSiteRegistration", "siteModifier");
    expect(mod?.isRequired).toBe(true);
    expect(mod?.default).toBe("UNSPECIFIED");
    // K14: sweep target enum present with ACTIVE default.
    expect(field("PesticideProduct", "sourceStatus")?.default).toBe("ACTIVE");
  });
});
