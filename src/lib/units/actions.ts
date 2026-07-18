"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import {
  createCustomUnitCore,
  listCustomUnitsCore,
  type CreateCustomUnitInput,
  type CreateCustomUnitResult,
  type CustomUnitRow,
} from "@/lib/units/custom-unit-core";

// Plan 075: server-action wrappers over the custom-unit cores (READY-USER gated via `action`, like the
// expendables intake flow). The create-unit modal and the manual expendables form both go through these;
// scripts + the assistant tool call the cores directly.

/** Create a custom unit for the current tenant. Returns the core's { ok, error } result (never throws for
 *  validation) so the modal can show the message inline. Revalidates the expendables surface so the new unit
 *  shows up in the dropdowns on the next load. */
export const createCustomUnitAction = action(async ({ actor }, input: CreateCustomUnitInput): Promise<CreateCustomUnitResult> => {
  const res = await createCustomUnitCore(actor, input);
  if (res.ok) revalidatePath("/setup/expendables");
  return res;
});

/** List the current tenant's custom units (for populating unit dropdowns). */
export const listCustomUnitsAction = action(async (): Promise<CustomUnitRow[]> => {
  return listCustomUnitsCore();
});
