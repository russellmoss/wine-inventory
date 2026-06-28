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
import {
  applyToGroup,
  type GroupApplyResult,
  type GroupOpSpec,
  type GroupTarget,
} from "@/lib/cellar/group-apply";
import {
  addMemberCore,
  createGroupCore,
  deactivateGroupCore,
  removeMemberCore,
  renameGroupCore,
  type VesselGroupDTO,
} from "@/lib/vessels/groups";
import {
  correctBatchCore,
  correctOperationCore,
  type BatchCorrectResult,
  type CorrectResult,
} from "@/lib/cellar/correct";
import {
  rackWineCore,
  revertTransferCore,
  type TransferWineInput,
  type TransferWineResult,
  type RevertTransferResult,
} from "@/lib/vessels/rack-core";
import {
  deleteNeutralOperationCore,
  editNeutralOperationCore,
  type EditNeutralInput,
} from "@/lib/cellar/edit";

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

// ── Vessel groups (CRUD + fan-out) ──

export const createGroupAction = action(
  async ({ actor }, input: { name: string; note?: string; vesselIds?: string[] }): Promise<VesselGroupDTO> => {
    const dto = await createGroupCore(actor, input);
    revalidatePath("/bulk");
    return dto;
  },
);

export const renameGroupAction = action(async ({ actor }, groupId: string, name: string): Promise<void> => {
  await renameGroupCore(actor, groupId, name);
  revalidatePath("/bulk");
});

export const deactivateGroupAction = action(async ({ actor }, groupId: string): Promise<void> => {
  await deactivateGroupCore(actor, groupId);
  revalidatePath("/bulk");
});

export const addGroupMemberAction = action(async ({ actor }, groupId: string, vesselId: string): Promise<void> => {
  await addMemberCore(actor, groupId, vesselId);
  revalidatePath("/bulk");
});

export const removeGroupMemberAction = action(async ({ actor }, groupId: string, vesselId: string): Promise<void> => {
  await removeMemberCore(actor, groupId, vesselId);
  revalidatePath("/bulk");
});

/** Fan one cellar operation out across a group (or ad-hoc multi-select). */
export const applyToGroupAction = action(
  async ({ actor }, target: GroupTarget, spec: GroupOpSpec): Promise<GroupApplyResult> => {
    const res = await applyToGroup(actor, target, spec);
    revalidateCaptureSurfaces();
    return res;
  },
);

// ── Correction / undo ──

/** Correct (revert volumetric / void neutral) one Phase 3 operation — also the toast Undo. */
export const correctOperationAction = action(
  async ({ actor }, operationId: number, note?: string): Promise<CorrectResult> => {
    const res = await correctOperationCore(actor, { operationId, note });
    revalidateCaptureSurfaces();
    return res;
  },
);

/** Correct every member op of a group fan-out (shared batchId). */
export const correctBatchAction = action(
  async ({ actor }, batchId: string): Promise<BatchCorrectResult> => {
    const res = await correctBatchCore(actor, { batchId });
    revalidateCaptureSurfaces();
    return res;
  },
);

// ── Racking (vessel-first home for the Phase 1/2 transfer core) ──

/** Rack wine from a source vessel into a destination; lees loss is derived (out − in). */
export const rackVesselAction = action(
  async ({ actor }, input: TransferWineInput): Promise<TransferWineResult> => {
    const res = await rackWineCore(actor, input);
    revalidateCaptureSurfaces();
    return res;
  },
);

/** Undo a rack via its compensating CORRECTION (the toast Undo for a rack). */
export const revertRackAction = action(
  async ({ actor }, transferId: string): Promise<RevertTransferResult> => {
    const res = await revertTransferCore(actor, { transferId });
    revalidateCaptureSurfaces();
    return res;
  },
);

// ── Timeline edit/delete (volume-neutral ops only; volumetric ops use correct/revert) ──

/** Hard-delete an erroneous neutral op off the timeline (audit row retained). */
export const deleteOperationAction = action(
  async ({ actor }, operationId: number): Promise<{ deletedOperationId: number }> => {
    const res = await deleteNeutralOperationCore(actor, { operationId });
    revalidateCaptureSurfaces();
    return res;
  },
);

/** Edit a neutral op's treatment(s) in place (material/rate/basis/note or cap kind/duration). */
export const editOperationAction = action(
  async ({ actor }, input: EditNeutralInput): Promise<{ operationId: number }> => {
    const res = await editNeutralOperationCore(actor, input);
    revalidateCaptureSurfaces();
    return res;
  },
);
