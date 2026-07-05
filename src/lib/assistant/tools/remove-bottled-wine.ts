import "server-only";
import { prisma } from "@/lib/prisma";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveExactlyOne } from "./resolve";
import { BOTTLED_REMOVAL_DISPOSITIONS, BOTTLED_REMOVAL_LABELS, isBottledRemovalDisposition, type BottledRemovalDisposition } from "@/lib/compliance/bottled-removal";
import { removeBottledTyped } from "@/lib/compliance/removal-actions";

// Wave 3 (compliance removals) — remove BOTTLED wine from finished-goods inventory with a disposition, so
// the §B removal line is accurate (not everything reading as B8). Wraps removeBottledCore: decrements the
// BottledInventory count + writes a negative BOTTLED_WINE StockMovement tagged with the disposition (NOT the
// bulk ledger). ADMIN-only + confirm-nonce. Resolves the SKU (name + optional vintage) and the location.

type RawInput = { wine?: string; vintage?: number; location?: string; bottles?: number; disposition?: string; note?: string };

async function resolveSku(name: string, vintage?: number): Promise<{ id: string; label: string }> {
  const wines = await prisma.wineSku.findMany({
    where: { isActive: true, name: { contains: name, mode: "insensitive" }, ...(vintage ? { vintage } : {}) },
    take: 8,
    select: { id: true, name: true, vintage: true },
  });
  const w = resolveExactlyOne(wines, {
    describe: (x) => `${x.name}${x.vintage ? ` ${x.vintage}` : ""}`,
    noneMsg: `No bottled wine matches "${name}"${vintage ? ` (${vintage})` : ""}.`,
    manyMsg: `Several wines match "${name}"`,
  });
  return { id: w.id, label: `${w.name}${w.vintage ? ` ${w.vintage}` : ""}` };
}

async function resolveLocation(name?: string): Promise<{ id: string; name: string }> {
  const locs = await prisma.location.findMany({
    where: { isActive: true, ...(name ? { name: { contains: name, mode: "insensitive" } } : {}) },
    take: 10,
    select: { id: true, name: true },
  });
  if (locs.length === 0) throw new Error(name ? `No location matches "${name}".` : "No active locations exist.");
  if (name) return resolveExactlyOne(locs, { describe: (l) => l.name, noneMsg: `No location matches "${name}".`, manyMsg: `Several locations match "${name}"` });
  if (locs.length === 1) return locs[0];
  throw new Error(`Which location? One of: ${locs.map((l) => l.name).join(", ")}.`);
}

export const removeBottledWineTool: AssistantTool = {
  name: "remove_bottled_wine",
  description:
    "Remove BOTTLED (finished-goods) wine from inventory with a disposition — the §B removal path (taxpaid/sold, tasting, export, family use, testing, breakage). Use when finished bottles leave inventory: 'remove 12 bottles of Marp Reserve 2022 for tasting', 'log 6 bottles breakage of Sparkling Brut'. This comes out of bottled INVENTORY (not a tank) — for a bulk vessel removal use remove_bulk_wine; for a plain stock correction use adjust_inventory. Admin only. Returns a preview to confirm.",
  kind: "write",
  adminOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      wine: { type: "string", description: "Bottled wine SKU name, e.g. 'Marp Reserve'." },
      vintage: { type: "integer", description: "Vintage year, to disambiguate (optional)." },
      location: { type: "string", description: "Location the bottles are at. Optional if there's only one." },
      bottles: { type: "integer", description: "Whole number of bottles removed (≥1)." },
      disposition: { type: "string", enum: [...BOTTLED_REMOVAL_DISPOSITIONS], description: "Why they left: TAXPAID (sold), TASTING, EXPORT, FAMILY_USE, TESTING, BREAKAGE. Defaults to TAXPAID." },
      note: { type: "string", description: "Optional note." },
    },
    required: ["wine", "bottles"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    if (!input.wine || typeof input.wine !== "string") throw new Error("Which bottled wine?");
    if (!Number.isInteger(input.bottles) || (input.bottles ?? 0) < 1) throw new Error("How many bottles? Give a whole number (≥1).");
    const disposition = (input.disposition && isBottledRemovalDisposition(input.disposition) ? input.disposition : "TAXPAID") as BottledRemovalDisposition;

    const sku = await resolveSku(input.wine, input.vintage);
    const loc = await resolveLocation(input.location);

    const preview = `${BOTTLED_REMOVAL_LABELS[disposition]}: remove ${input.bottles} bottle(s) of ${sku.label} from ${loc.name}.`;
    const token = signProposal("remove_bottled_wine", {
      wineSkuId: sku.id,
      locationId: loc.id,
      bottles: input.bottles,
      disposition,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      skuLabel: sku.label,
      locationName: loc.name,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitRemoveBottledWine: Committer = async (_user, args) => {
  const res = await removeBottledTyped({
    wineSkuId: String(args.wineSkuId),
    locationId: String(args.locationId),
    bottles: Number(args.bottles),
    disposition: String(args.disposition) as BottledRemovalDisposition,
    note: args.note == null ? undefined : String(args.note),
  });
  return { message: res.message };
};
