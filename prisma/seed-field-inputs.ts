/**
 * Idempotent seed for the spray/fertilizer master list. Upserts the default
 * FieldInput rows on [type, normalizedKey] so re-running adds nothing. Shares the
 * same sanitizers the add-on-the-fly action uses, so seeded + custom rows are
 * normalized identically. Run standalone via `npx tsx prisma/seed-field-inputs.ts`
 * or as part of `prisma/seed.ts`.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { cleanInputName, normalizeInputKey } from "../src/lib/fieldnotes/sanitize";

const DEFAULTS: { type: "SPRAY" | "FERTILIZER"; name: string }[] = [
  { type: "SPRAY", name: "Mancozeb" },
  { type: "SPRAY", name: "Sulfur" },
  { type: "SPRAY", name: "Copper" },
  { type: "SPRAY", name: "Neem" },
  { type: "FERTILIZER", name: "NPK" },
  { type: "FERTILIZER", name: "Epsom Salts" },
];

export async function seedFieldInputs(db: PrismaClient = prisma): Promise<number> {
  let count = 0;
  for (const { type, name } of DEFAULTS) {
    const normalizedKey = normalizeInputKey(name);
    await db.fieldInput.upsert({
      where: { type_normalizedKey: { type, normalizedKey } },
      update: {}, // never clobber an admin-renamed display label
      create: { type, name: cleanInputName(name), normalizedKey, isActive: true },
    });
    count++;
  }
  return count;
}

// Standalone entrypoint (no-op when imported).
if (process.argv[1] && process.argv[1].includes("seed-field-inputs")) {
  seedFieldInputs()
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
