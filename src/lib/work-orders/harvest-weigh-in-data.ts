import { prisma } from "@/lib/prisma";
import { canManagerAccessVineyard } from "@/lib/access";
import { getActionUser } from "@/lib/actions";

// Plan 039: data for the work-order fruit-intake / weigh-in execute sub-form. The block is a run-time
// target (like a vessel is for cellar ops), so we surface the blocks the user can access (admins see all;
// managers are pinned to their vineyard membership) — the same scoping the harvest module + assistant use.

export type WeighInBlockOption = {
  blockId: string;
  label: string; // "Vineyard · Block"
  vineyardName: string;
  varietyName: string | null;
};

export type HarvestWeighInFormData = { blocks: WeighInBlockOption[]; defaultVintage: number };

export async function loadHarvestWeighInFormData(): Promise<HarvestWeighInFormData> {
  const user = await getActionUser();
  const rows = await prisma.vineyardBlock.findMany({
    orderBy: [{ vineyard: { name: "asc" } }, { sortOrder: "asc" }],
    select: {
      id: true,
      blockLabel: true,
      code: true,
      vineyardId: true,
      vineyard: { select: { name: true } },
      variety: { select: { name: true } },
    },
  });
  const blocks: WeighInBlockOption[] = rows
    .filter((b) => canManagerAccessVineyard(user, b.vineyardId))
    .map((b) => ({
      blockId: b.id,
      label: `${b.vineyard.name} · ${b.blockLabel ?? b.code ?? "block"}`,
      vineyardName: b.vineyard.name,
      varietyName: b.variety?.name ?? null,
    }));
  return { blocks, defaultVintage: new Date().getFullYear() };
}
