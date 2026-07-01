"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

// Phase 7 (K14): toggle the winery-level sparkling capability. Admin-only; audited. Revalidates
// the layout so the gated nav (En Tirage) appears/disappears immediately.
export const setSparklingEnabled = adminAction(async ({ actor }, enabled: boolean): Promise<{ sparklingEnabled: boolean }> => {
  await prisma.$transaction(async (tx) => {
    await tx.appSettings.upsert({
      where: { id: "singleton" },
      update: { sparklingEnabled: enabled },
      create: { id: "singleton", sparklingEnabled: enabled },
    });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "AppSettings", entityId: "singleton", summary: `Sparkling program ${enabled ? "enabled" : "disabled"}` });
  });
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  revalidatePath("/cellar/en-tirage");
  return { sparklingEnabled: enabled };
});
