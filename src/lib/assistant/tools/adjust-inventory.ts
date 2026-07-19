import "server-only";
import { prisma } from "@/lib/prisma";
import { moveStock } from "@/lib/inventory/actions";
import { unwrap } from "@/lib/action-result";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveExactlyOne } from "./resolve";

type AdjustInput = {
  item?: string;
  vintage?: number;
  location?: string;
  delta?: number;
  reason?: string;
};

type ResolvedItem = { kind: "BOTTLED_WINE" | "FINISHED_GOOD"; id: string; name: string; unitWord: string };

async function resolveItem(item: string, vintage?: number): Promise<ResolvedItem> {
  const wines = await prisma.wineSku.findMany({
    where: { isActive: true, name: { contains: item, mode: "insensitive" }, ...(vintage ? { vintage } : {}) },
    take: 6,
    select: { id: true, name: true, vintage: true },
  });
  if (wines.length > 0) {
    const w = resolveExactlyOne(wines, {
      describe: (x) => `${x.name} ${x.vintage}`,
      noneMsg: `No wine matches "${item}".`,
      manyMsg: `Several wines match "${item}"`,
    });
    return { kind: "BOTTLED_WINE", id: w.id, name: `${w.name} ${w.vintage}`, unitWord: "bottles" };
  }
  const goods = await prisma.finishedGood.findMany({
    where: { isActive: true, name: { contains: item, mode: "insensitive" } },
    take: 6,
    select: { id: true, name: true },
  });
  const g = resolveExactlyOne(goods, {
    describe: (x) => x.name,
    noneMsg: `No wine or item matches "${item}".`,
    manyMsg: `Several items match "${item}"`,
  });
  return { kind: "FINISHED_GOOD", id: g.id, name: g.name, unitWord: "units" };
}

async function resolveLocation(location?: string): Promise<{ id: string; name: string }> {
  const locs = await prisma.location.findMany({
    where: { isActive: true, ...(location ? { name: { contains: location, mode: "insensitive" } } : {}) },
    take: 10,
    select: { id: true, name: true },
  });
  if (locs.length === 0) throw new Error(location ? `No location matches "${location}".` : "No active locations exist.");
  if (location) {
    return resolveExactlyOne(locs, {
      describe: (l) => l.name,
      noneMsg: `No location matches "${location}".`,
      manyMsg: `Several locations match "${location}"`,
    });
  }
  if (locs.length === 1) return locs[0];
  throw new Error(`Which location? One of: ${locs.map((l) => l.name).join(", ")}.`);
}

export const adjustInventoryTool: AssistantTool = {
  name: "adjust_inventory",
  description:
    "Adjust the on-hand quantity of a bottled wine or finished good at a location by a signed amount (e.g. -6 to remove six, +12 to add twelve). Use for corrections, breakage, or found stock. This does NOT save immediately — it returns a preview the user must confirm in the UI.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      item: { type: "string", description: "Wine or item name, e.g. 'Marp Reserve'." },
      vintage: { type: "integer", description: "Vintage year, to disambiguate a wine (optional)." },
      location: { type: "string", description: "Location name. Optional if there is only one location." },
      delta: { type: "integer", description: "Signed change in units: negative to remove, positive to add. Cannot be zero." },
      reason: { type: "string", description: "Short reason for the adjustment (optional)." },
    },
    required: ["item", "delta"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as AdjustInput;
    if (!input.item || typeof input.item !== "string") throw new Error("Which item should I adjust?");
    if (typeof input.delta !== "number" || !Number.isInteger(input.delta) || input.delta === 0) {
      throw new Error("Provide a non-zero whole-number adjustment (e.g. -6 or +12).");
    }
    const item = await resolveItem(input.item, input.vintage);
    const location = await resolveLocation(input.location);
    const reason = input.reason?.trim() || "Assistant adjustment";

    const sign = input.delta > 0 ? "+" : "";
    const preview = `Adjust ${item.name} at ${location.name} by ${sign}${input.delta} ${item.unitWord} (${reason}).`;
    const token = signProposal("adjust_inventory", {
      kind: item.kind,
      itemId: item.id,
      itemName: item.name,
      unitWord: item.unitWord,
      locationId: location.id,
      locationName: location.name,
      delta: input.delta,
      reason,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitAdjustInventory: Committer = async (_user, args) => {
  const fd = new FormData();
  fd.set("kind", String(args.kind));
  fd.set("itemId", String(args.itemId));
  fd.set("mode", "ADJUST");
  fd.set("locationId", String(args.locationId));
  fd.set("delta", String(args.delta));
  fd.set("reason", String(args.reason ?? "Assistant adjustment"));
  // moveStock is now a `safeAction` (settles instead of throwing) — unwrap so a blocked adjustment
  // surfaces its real reason to the assistant instead of being reported as a phantom success.
  unwrap(await moveStock(fd));
  const sign = Number(args.delta) > 0 ? "+" : "";
  return {
    message: `Adjusted ${String(args.itemName)} at ${String(args.locationName)} by ${sign}${Number(args.delta)} ${String(args.unitWord ?? "units")}.`,
  };
};
