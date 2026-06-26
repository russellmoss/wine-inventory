import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AssistantTool } from "../registry";
import { resolveVessel } from "../scope";

type QueryTransfersInput = { vessel?: string; limit?: number };

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function label(type: string | undefined, code: string): string {
  if (type === "BARREL") return `Barrel ${code}`;
  if (type === "TANK") return `Tank ${code}`;
  return code;
}

export const queryTransfersTool: AssistantTool = {
  name: "query_transfers",
  description:
    "List recent wine rackings/transfers between vessels, newest first. Use for open-ended history questions like 'recent rackings', 'transfer history', or 'when did we last rack barrel 14'. Optionally narrow to a single vessel (matches transfers in or out of it).",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vessel: { type: "string", description: "Narrow to one vessel, e.g. 'barrel 14' (optional)." },
      limit: { type: "integer", description: `How many to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).` },
    },
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as QueryTransfersInput;

    let where: Prisma.VesselTransferWhereInput = {};
    if (input.vessel) {
      const v = await resolveVessel(input.vessel);
      where = { OR: [{ fromVesselId: v.id }, { toVesselId: v.id }] };
    }

    const limit = Math.min(
      Math.max(typeof input.limit === "number" ? Math.trunc(input.limit) : DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const rows = await prisma.vesselTransfer.findMany({
      where,
      orderBy: { rackedAt: "desc" },
      take: limit,
      select: {
        rackedAt: true,
        fromVesselCode: true,
        toVesselCode: true,
        volumeL: true,
        lossL: true,
        components: true,
        note: true,
        revertedAt: true,
        revertsId: true,
        fromVessel: { select: { type: true } },
        toVessel: { select: { type: true } },
      },
    });

    if (rows.length === 0) {
      return { message: "No rackings are recorded yet for that scope." };
    }

    return {
      results: rows.map((r) => ({
        rackedAt: r.rackedAt.toISOString().slice(0, 10),
        from: label(r.fromVessel?.type, r.fromVesselCode),
        to: label(r.toVessel?.type, r.toVesselCode),
        volumeL: Number(r.volumeL),
        lossL: Number(r.lossL),
        components: r.components,
        note: r.note,
        reverted: r.revertedAt != null, // this rack was undone
        isReversal: r.revertsId != null, // this entry is itself a revert of another rack
      })),
    };
  },
};
