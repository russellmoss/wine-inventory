/**
 * Seed the variety/vineyard lot-code abbreviations the user specified (plan 017, Unit 3).
 * Idempotent: matches existing rows by name (case-insensitive, alias-aware) and sets the
 * abbreviation only when it differs and isn't already taken by another row. Reports skips.
 *
 * Run:  npx tsx --env-file=.env scripts/seed-abbreviations.ts
 */
import { prisma } from "@/lib/prisma";

const VARIETY_ABBR: { abbr: string; aliases: string[] }[] = [
  { abbr: "PN", aliases: ["pinot noir", "pinot"] },
  { abbr: "CS", aliases: ["cabernet sauvignon", "cab sauv", "cab sauvignon", "cab sav"] },
  { abbr: "CF", aliases: ["cabernet franc", "cab franc"] },
  { abbr: "MR", aliases: ["merlot"] },
  { abbr: "MB", aliases: ["malbec"] },
];

const VINEYARD_ABBR: { abbr: string; aliases: string[] }[] = [
  { abbr: "GS", aliases: ["gortshalu", "gortshaling"] },
  { abbr: "NT", aliases: ["norzinthang"] },
  { abbr: "PS", aliases: ["pinsa"] },
  { abbr: "PR", aliases: ["paro"] },
  { abbr: "SB", aliases: ["ser bhum", "serbhum", "ser bum"] },
];

const norm = (s: string) => s.trim().toLowerCase();

async function seedVarieties() {
  const rows = await prisma.variety.findMany({ select: { id: true, name: true, abbreviation: true } });
  for (const { abbr, aliases } of VARIETY_ABBR) {
    const match = rows.find((r) => aliases.includes(norm(r.name)));
    if (!match) {
      console.log(`  variety ${abbr}: no name match (${aliases[0]}) — skipped`);
      continue;
    }
    if (match.abbreviation === abbr) {
      console.log(`  variety ${abbr}: already set on "${match.name}"`);
      continue;
    }
    const taken = await prisma.variety.findFirst({ where: { abbreviation: abbr, id: { not: match.id } }, select: { name: true } });
    if (taken) {
      console.log(`  variety ${abbr}: already used by "${taken.name}" — skipped "${match.name}"`);
      continue;
    }
    await prisma.variety.update({ where: { id: match.id }, data: { abbreviation: abbr } });
    console.log(`  variety ${abbr}: set on "${match.name}"`);
  }
}

async function seedVineyards() {
  const rows = await prisma.vineyard.findMany({ select: { id: true, name: true, abbreviation: true } });
  for (const { abbr, aliases } of VINEYARD_ABBR) {
    const match = rows.find((r) => aliases.includes(norm(r.name)));
    if (!match) {
      console.log(`  vineyard ${abbr}: no name match (${aliases[0]}) — skipped`);
      continue;
    }
    if (match.abbreviation === abbr) {
      console.log(`  vineyard ${abbr}: already set on "${match.name}"`);
      continue;
    }
    const taken = await prisma.vineyard.findFirst({ where: { abbreviation: abbr, id: { not: match.id } }, select: { name: true } });
    if (taken) {
      console.log(`  vineyard ${abbr}: already used by "${taken.name}" — skipped "${match.name}"`);
      continue;
    }
    await prisma.vineyard.update({ where: { id: match.id }, data: { abbreviation: abbr } });
    console.log(`  vineyard ${abbr}: set on "${match.name}"`);
  }
}

async function main() {
  console.log("Seeding variety abbreviations:");
  await seedVarieties();
  console.log("Seeding vineyard abbreviations:");
  await seedVineyards();
  console.log("\nCurrent abbreviations:");
  const [vs, vys] = await Promise.all([
    prisma.variety.findMany({ where: { abbreviation: { not: null } }, select: { name: true, abbreviation: true }, orderBy: { name: "asc" } }),
    prisma.vineyard.findMany({ where: { abbreviation: { not: null } }, select: { name: true, abbreviation: true }, orderBy: { name: "asc" } }),
  ]);
  for (const v of vs) console.log(`  variety  ${v.abbreviation}\t${v.name}`);
  for (const v of vys) console.log(`  vineyard ${v.abbreviation}\t${v.name}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
