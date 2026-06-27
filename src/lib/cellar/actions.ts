"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import {
  addAdditionCore,
  addFiningCore,
  type AddAdditionInput,
  type CellarBaseResult,
  type CellarOpResult,
} from "@/lib/cellar/addition";
import {
  capManagementCore,
  filterVesselCore,
  type CapManagementInput,
  type FiltrationInput,
} from "@/lib/cellar/treatments";
import { recordLossCore, type RecordLossInput } from "@/lib/cellar/loss";
import { topVesselCore, type ToppingInput, type ToppingResult } from "@/lib/cellar/topping";
import { upsertMaterialCore, type CellarMaterialDTO, type UpsertMaterialInput } from "@/lib/cellar/materials";

// "use server" wrappers for the Phase 3 cellar operations. Each authorizes a ready user,
// then calls the script-safe core with the audit actor and revalidates the capture
// surfaces. Cores live in addition.ts / treatments.ts / loss.ts / topping.ts /
// group-apply.ts / correct.ts; scripts + the group engine call those cores directly.

function revalidateCaptureSurfaces() {
  revalidatePath("/bulk");
  revalidatePath("/lots");
}

/** Upsert a material from the picker (datalist "add on the fly"). */
export const upsertMaterialAction = action(
  async ({ actor }, input: UpsertMaterialInput): Promise<CellarMaterialDTO> => {
    const dto = await upsertMaterialCore(actor, input);
    revalidatePath("/bulk");
    return dto;
  },
);

/** Record an addition (volume-neutral material dose) against a vessel's lot(s). */
export const addAdditionAction = action(
  async ({ actor }, input: AddAdditionInput): Promise<CellarOpResult> => {
    const res = await addAdditionCore(actor, input);
    revalidateCaptureSurfaces();
    return res;
  },
);

/** Record a fining (volume-neutral; the loss is realized later at racking). */
export const addFiningAction = action(
  async ({ actor }, input: AddAdditionInput): Promise<CellarOpResult> => {
    const res = await addFiningCore(actor, input);
    revalidateCaptureSurfaces();
    return res;
  },
);

/** Record a filtration (volume loss + medium/micron detail). */
export const filterVesselAction = action(
  async ({ actor }, input: FiltrationInput): Promise<CellarBaseResult> => {
    const res = await filterVesselCore(actor, input);
    revalidateCaptureSurfaces();
    return res;
  },
);

/** Record cap management (pump-over / punch-down) — one-tap, volume-neutral. */
export const capManagementAction = action(
  async ({ actor }, input: CapManagementInput): Promise<CellarBaseResult> => {
    const res = await capManagementCore(actor, input);
    revalidateCaptureSurfaces();
    return res;
  },
);

/** Record a standalone loss / angel's share (volume drops). */
export const recordLossAction = action(
  async ({ actor }, input: RecordLossInput): Promise<CellarBaseResult> => {
    const res = await recordLossCore(actor, input);
    revalidateCaptureSurfaces();
    return res;
  },
);

/** Top a vessel from a source keg lot (moves volume + appends lineage). */
export const topVesselAction = action(
  async ({ actor }, input: ToppingInput): Promise<ToppingResult> => {
    const res = await topVesselCore(actor, input);
    revalidateCaptureSurfaces();
    return res;
  },
);
