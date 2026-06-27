"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import { addAdditionCore, type AddAdditionInput, type CellarOpResult } from "@/lib/cellar/addition";
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
