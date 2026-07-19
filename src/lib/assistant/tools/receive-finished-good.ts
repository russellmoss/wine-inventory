import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { prisma } from "@/lib/prisma";
import { pickLocation } from "./location-picker";
import { resolveExactlyOne } from "./resolve";
import { receivePurchasedFinishedGoodAction } from "@/lib/inventory/actions";

// Plan 080 U7 — receive PURCHASED finished goods (merchandise, or wine bought in / bought back) into a
// location at a known cost. Wraps the U7 cost layer: the units land as stock AND a FinishedGoodReceipt
// records what they cost, so valuation is a weighted average over receipts (council C4).
//
// Scope boundary the description has to carry: this is for goods you BOUGHT. Wine you bottled yourself is
// already on hand with its specific-lot COGS frozen from the bottling run (COST-3) — receiving it here
// would double-count the stock. A library BUY-BACK of your own wine is a genuine purchase and does belong.

type RawInput = { item?: string; qty?: number; location?: string; unitCost?: number; vendor?: string; note?: string };

type Target = { kind: "BOTTLED_WINE" | "FINISHED_GOOD"; id: string; name: string };

async function resolveItem(item: string): Promise<Target> {
  const q = item.trim();
  const [skus, goods] = await Promise.all([
    prisma.wineSku.findMany({ where: { isActive: true, name: { contains: q, mode: "insensitive" } }, take: 10, select: { id: true, name: true, vintage: true } }),
    prisma.finishedGood.findMany({ where: { isActive: true, name: { contains: q, mode: "insensitive" } }, take: 10, select: { id: true, name: true } }),
  ]);
  const candidates: Target[] = [
    ...skus.map((s) => ({ kind: "BOTTLED_WINE" as const, id: s.id, name: `${s.name}${s.vintage ? ` ${s.vintage}` : ""}` })),
    ...goods.map((g) => ({ kind: "FINISHED_GOOD" as const, id: g.id, name: g.name })),
  ];
  return resolveExactlyOne(candidates, {
    describe: (c) => c.name,
    noneMsg: `No wine or merchandise item matches "${q}". Add it to the catalog first.`,
    manyMsg: `Several items match "${q}"`,
  });
}

export const receiveFinishedGoodTool: AssistantTool = {
  name: "receive_finished_good",
  description:
    "Receive PURCHASED finished goods — merchandise or wine bought in for resale — into a location, recording what they cost: 'received 48 logo glasses at $4 each into the Tasting Room', 'bought back 12 bottles of the 2019 Cabernet at $22'. Records the stock AND its purchase cost. Do NOT use this for wine your winery bottled itself — that is already on hand with its own cost from the bottling run. Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      item: { type: "string", description: "The wine SKU or merchandise item by name." },
      qty: { type: "number", description: "How many units were received (whole number)." },
      location: { type: "string", description: "Where they landed, e.g. 'Tasting Room'." },
      unitCost: { type: "number", description: "What each unit cost, in the winery's base currency. Omit if genuinely unknown." },
      vendor: { type: "string", description: "Optional vendor name." },
      note: { type: "string", description: "Optional note." },
    },
    required: ["item", "qty", "location"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    if (!input.item || typeof input.item !== "string") throw new Error("Which item did you receive?");
    const qty = Number(input.qty);
    if (!Number.isInteger(qty) || qty <= 0) throw new Error("How many units? Give a positive whole number.");

    const target = await resolveItem(input.item);
    const loc = await pickLocation(input.location);
    const unitCost = typeof input.unitCost === "number" && input.unitCost >= 0 ? input.unitCost : undefined;

    const costClause = unitCost != null ? ` @ ${unitCost} each` : " (cost unknown — it will value as unknown, not $0)";
    const preview = `Receive ${qty} × ${target.name} into ${loc.name}${costClause}${input.vendor ? ` from ${input.vendor}` : ""}.`;
    const token = signProposal("receive_finished_good", {
      kind: target.kind,
      itemId: target.id,
      itemName: target.name,
      qty,
      locationId: loc.id,
      locationLabel: loc.name,
      ...(unitCost != null ? { unitCost } : {}),
      ...(input.vendor?.trim() ? { vendor: input.vendor.trim() } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitReceiveFinishedGood: Committer = async (_user, args) => {
  await receivePurchasedFinishedGoodAction({
    kind: String(args.kind) as "BOTTLED_WINE" | "FINISHED_GOOD",
    itemId: String(args.itemId),
    qty: Number(args.qty),
    locationId: String(args.locationId),
    unitCost: args.unitCost == null ? null : Number(args.unitCost),
    vendorName: args.vendor == null ? null : String(args.vendor),
    note: args.note == null ? null : String(args.note),
  });
  return { message: `Received ${Number(args.qty)} × ${String(args.itemName)} into ${String(args.locationLabel)}.` };
};
