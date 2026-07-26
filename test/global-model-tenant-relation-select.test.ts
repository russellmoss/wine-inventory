import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { GLOBAL_MODELS } from "@/lib/tenant/models";

/**
 * The GLOBAL-parent / RLS-CHILD seam.
 *
 * A model on the tenant-extension denylist (`GLOBAL_MODELS` — the Better Auth / org tables) is
 * passed STRAIGHT THROUGH by the Prisma extension in `src/lib/prisma.ts`: no
 * `set_config('app.tenant_id', …)` transaction is opened for it, because Better Auth queries those
 * tables before any tenant exists. Every OTHER table is tenant-scoped with FORCE ROW LEVEL SECURITY
 * and a fail-closed `tenant_isolation` policy.
 *
 * Put those together and a nested relation from a global model onto a tenant-scoped one is read with
 * `app.tenant_id` UNSET — so it silently returns ZERO rows under the `app_rls` (NOBYPASSRLS) runtime
 * role, with no error. That is exactly how `AppUser.vineyardIds` came back empty for every manager
 * (`user` → `user_vineyard`), locking managers out of field notes, the vineyard-scoped assistant
 * tools and the /lots lens, and — on the admin Users page — turning "add a vineyard" into a silent
 * wipe of the memberships the user already had. It was invisible while the app still connected as
 * the owner (BYPASSRLS) and became total at the Phase-12 app_rls cutover.
 *
 * These reads MUST be separate, explicitly tenant-scoped queries (`loadVineyardMembershipIds` /
 * `loadVineyardMembershipIdsByUser` in `src/lib/dal.ts`). This test is the static half of the guard;
 * `npm run verify:tenant-isolation` proves the runtime behaviour against a real database.
 *
 * Source-text based on purpose: importing `src/lib/dal.ts` here would drag in `server-only`,
 * `next/headers` and the auth stack. The DMMF supplies the relation names, so a NEW tenant relation
 * added to a global model is covered automatically — nothing to keep in sync by hand.
 */

// Files that read a global model and historically selected (or could select) a tenant relation.
const GUARDED_FILES = [
  "src/lib/dal.ts",
  "src/lib/users/actions.ts",
  "src/app/(app)/users/page.tsx",
  "src/lib/auth.ts",
  "src/lib/work-orders/data.ts",
  "src/lib/inbox/direct-messages.ts",
];

/** Relation fields on global models that point at a tenant-scoped (RLS'd) model. */
function tenantRelationsOnGlobalModels(): { model: string; relation: string; target: string }[] {
  const out: { model: string; relation: string; target: string }[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    if (!GLOBAL_MODELS.has(model.name)) continue;
    for (const field of model.fields) {
      if (field.kind !== "object") continue;
      if (GLOBAL_MODELS.has(field.type)) continue; // global → global is fine, no RLS either side
      out.push({ model: model.name, relation: field.name, target: field.type });
    }
  }
  return out;
}

describe("global models never select a tenant-scoped relation (RLS reads it back empty)", () => {
  const relations = tenantRelationsOnGlobalModels();

  it("the datamodel still has global models with tenant-scoped relations (guard is meaningful)", () => {
    // If this ever hits zero the seam is gone — but far more likely someone widened GLOBAL_MODELS.
    expect(relations.length).toBeGreaterThan(0);
  });

  for (const file of GUARDED_FILES) {
    it(`${file} selects no tenant-scoped relation off a global model`, () => {
      const source = readFileSync(file, "utf8");
      const offenders = relations
        // `<relation>:` as a Prisma select/include key. Deliberately broad — these relation names
        // (vineyardMemberships, fieldNotes, voiceProfiles…) are not used as plain locals here.
        .filter((r) => new RegExp(`(^|[\\s{,])${r.relation}\\s*:`, "m").test(source))
        .map((r) => `${r.model}.${r.relation} -> ${r.target}`);
      expect(
        offenders,
        `${file} selects a tenant-scoped relation off a global model: ${offenders.join(", ")}. ` +
          `That read returns [] under app_rls — load it with a separate runAsTenant-scoped query instead ` +
          `(see loadVineyardMembershipIds in src/lib/dal.ts).`,
      ).toEqual([]);
    });
  }
});
