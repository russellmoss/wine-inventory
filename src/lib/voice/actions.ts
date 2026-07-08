"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import type { VoiceFocusMode } from "@/lib/voice/focus";
import {
  deleteVoiceProfileForUser,
  enrollVoiceProfileForUser,
  saveVoicePreferenceForUser,
} from "@/lib/voice/profile";
import type { VoiceSettingsView } from "@/lib/voice/settings-types";

function assertVectors(input: unknown): number[][] {
  if (!Array.isArray(input) || input.length < 3) {
    throw new Error("Three voice samples are required.");
  }
  return input.slice(0, 3).map((vector) => {
    if (!Array.isArray(vector)) throw new Error("Invalid voice sample.");
    return vector.map((n) => {
      const value = Number(n);
      if (!Number.isFinite(value)) throw new Error("Invalid voice sample.");
      return value;
    });
  });
}

export const saveVoicePreference = action(
  async (
    { actor },
    input: { defaultFocusMode?: VoiceFocusMode; audioIsolationEnabled?: boolean; wakeWordEnabled?: boolean },
  ): Promise<VoiceSettingsView> => {
    const result = await saveVoicePreferenceForUser(actor.actorUserId, input);
    await runInTenantTx(async (tx) => {
      await writeAudit(tx, {
        ...actor,
        action: "UPDATE",
        entityType: "VoicePreference",
        entityId: actor.actorUserId,
        summary: "Updated voice recognition preferences",
      });
    });
    revalidatePath("/settings");
    return result;
  },
);

export const enrollVoiceProfile = action(
  async ({ actor }, input: { vectors: unknown; consentAccepted: boolean }): Promise<VoiceSettingsView> => {
    if (!input.consentAccepted) throw new Error("Voice recognition consent is required.");
    const vectors = assertVectors(input.vectors);
    const result = await enrollVoiceProfileForUser(actor.tenantId, actor.actorUserId, vectors);
    await runInTenantTx(async (tx) => {
      await writeAudit(tx, {
        ...actor,
        action: "UPDATE",
        entityType: "VoiceProfile",
        entityId: actor.actorUserId,
        summary: "Enrolled voice recognition profile",
      });
    });
    revalidatePath("/settings");
    return result;
  },
);

export const deleteVoiceProfile = action(async ({ actor }): Promise<VoiceSettingsView> => {
  const result = await deleteVoiceProfileForUser(actor.actorUserId);
  await runInTenantTx(async (tx) => {
    await writeAudit(tx, {
      ...actor,
      action: "DELETE",
      entityType: "VoiceProfile",
      entityId: actor.actorUserId,
      summary: "Deleted voice recognition profile",
    });
  });
  revalidatePath("/settings");
  return result;
});
