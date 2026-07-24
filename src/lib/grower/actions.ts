"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import { createGrowerWithSync, updateGrowerWithSync } from "@/lib/grower/grower-sync";
import { getGrowerNearMatchesCore } from "@/lib/grower/data";
import type { CreateGrowerInput, UpdateGrowerInput } from "@/lib/grower/grower-core";

// Plan 095: grower CRUD server actions used by the ASSISTANT (create_grower committer) and any inline flow.
// READY-USER gated (`action`) to mirror the vendor create/update actions — the SETUP page keeps its own
// admin-gated wrappers in setup/growers/actions.ts. Both paths funnel through the shared grower-sync helpers,
// so the third-party → QBO-vendor push happens identically wherever a grower is created.

const PATH = "/setup/growers";

export const createGrowerAction = action(async ({ actor }, input: CreateGrowerInput) => {
  const res = await createGrowerWithSync(actor, input);
  revalidatePath(PATH);
  return res;
});

export const updateGrowerAction = action(async ({ actor }, input: UpdateGrowerInput) => {
  const res = await updateGrowerWithSync(actor, input);
  revalidatePath(PATH);
  return res;
});

/** Read-only near-duplicate check for a candidate grower name — drives the setup modal's "did you mean?" hint. */
export const checkGrowerNearMatchesAction = action(async (_ctx, name: string) => {
  return getGrowerNearMatchesCore(name);
});
