/**
 * Idempotent seed for the spray/fertilizer master list. Upserts the default FieldInput rows on the
 * per-tenant (tenantId, type, normalizedKey) unique so re-running adds nothing. Shares the same
 * sanitizers the add-on-the-fly action uses. Run standalone via `npx tsx prisma/seed-field-inputs.ts`
 * or as part of `prisma/seed.ts`. Runs inside a tenant context (Phase 12).
 */
import { prisma } from "../src/lib/prisma";
import { runAsTenant, requireTenantId } from "../src/lib/tenant/context";
import { cleanInputName, normalizeInputKey } from "../src/lib/fieldnotes/sanitize";

const BHUTAN_ORG_ID = "org_bhutan_wine_co";

const DEFAULTS: { type: "SPRAY" | "FERTILIZER"; name: string }[] = [
  { type: "SPRAY", name: "Mancozeb" },
  { type: "SPRAY", name: "Sulfur" },
  { type: "SPRAY", name: "Copper" },
  { type: "SPRAY", name: "Neem" },
  { type: "FERTILIZER", name: "NPK" },
  { type: "FERTILIZER", name: "Epsom Salts" },
];

/** Seed the default field inputs for the ACTIVE tenant (must run inside runAsTenant). */
export async function seedFieldInputs(db: typeof prisma = prisma): Promise<number> {
  const tenantId = requireTenantId();
  let count = 0;
  for (const { type, name } of DEFAULTS) {
    const normalizedKey = normalizeInputKey(name);
    await db.fieldInput.upsert({
      where: { tenantId_type_normalizedKey: { tenantId, type, normalizedKey } },
      update: {}, // never clobber an admin-renamed display label
      create: { type, name: cleanInputName(name), normalizedKey, isActive: true },
    });
    count++;
  }
  return count;
}

// Standalone entrypoint (no-op when imported).
if (process.argv[1] && process.argv[1].includes("seed-field-inputs")) {
  runAsTenant(BHUTAN_ORG_ID, () => seedFieldInputs())
    .then((n) => {
      console.log(`Field inputs ready (${n} defaults upserted)`);
      return prisma.$disconnect();
    })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
