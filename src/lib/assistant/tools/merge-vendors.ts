import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { mergeVendorsAction } from "@/lib/vendors/actions";
import { findVendorsByName, getVendorUsage } from "@/lib/vendors/vendors";
import { describeVendorUsage } from "@/lib/vendors/vendors-shared";
import { unwrap } from "@/lib/action-result";

// Plan 072 (Unit 9): MERGE two duplicate vendors — "merge Scott Labs into Scott Laboratories". Resolves
// both names to exactly one vendor each (asks the user to disambiguate on 0 / >1 matches), previews the
// impact (what moves onto the survivor), and confirm-gates. Admin-only + destructive: everything the
// loser touches (materials, supply lots, A/P bills, contacts) is re-pointed onto the survivor and the
// loser is permanently deleted. A QBO-mapping conflict can't be acknowledged over chat — the tool points
// the user to Setup → Vendors (which has the acknowledgement checkbox). Pure wrapper over the core.

const s = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Resolve a name to exactly one vendor, or throw a user-facing message describing why it can't. */
async function resolveOne(tenantId: string, ref: string, role: "keep (survivor)" | "remove (loser)") {
  const matches = await findVendorsByName(tenantId, ref);
  if (matches.length === 0) throw new Error(`No vendor matches “${ref}”. Check the name, or create it first.`);
  if (matches.length > 1) {
    const names = matches.slice(0, 6).map((v) => `“${v.name}”`).join(", ");
    throw new Error(`“${ref}” matches more than one vendor (${names}). Which one should I ${role}? Use the exact name.`);
  }
  return matches[0];
}

export const mergeVendorsTool: AssistantTool = {
  name: "merge_vendors",
  description:
    "Merge two DUPLICATE vendors that are really the same supplier into one — 'merge Scott Labs into Scott " +
    "Laboratories', 'these two Gusmer vendors are the same, combine them', 'dedupe our vendor list'. Everything " +
    "the merged-away vendor touches (materials, supply lots, accounting bills, contacts) is moved onto the vendor " +
    "you keep, then the duplicate is permanently deleted. Give the vendor to KEEP (the survivor) and the vendor " +
    "to REMOVE (the loser), by name. Admin-only and destructive — returns a preview to confirm. To just add a " +
    "vendor use create_vendor; to look them up use query_vendors.",
  kind: "write",
  adminOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      keep: { type: "string", description: "The vendor to KEEP (survivor) — the correct/preferred name, e.g. 'Scott Laboratories'." },
      remove: { type: "string", description: "The duplicate vendor to REMOVE (loser) — merged into 'keep' and deleted, e.g. 'Scott Labs'." },
    },
    required: ["keep", "remove"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as { keep?: string; remove?: string };
    const keep = s(input.keep);
    const remove = s(input.remove);
    if (!keep) throw new Error("Which vendor should I keep?");
    if (!remove) throw new Error("Which duplicate vendor should I merge away?");
    const tenantId = ctx.user.activeOrganizationId;
    if (!tenantId) throw new Error("No active winery selected.");

    const survivor = await resolveOne(tenantId, keep, "keep (survivor)");
    const loser = await resolveOne(tenantId, remove, "remove (loser)");
    if (survivor.id === loser.id) throw new Error("Those resolve to the same vendor — nothing to merge.");

    const usage = await getVendorUsage(loser.id, { tenantId });
    const preview =
      `Merge "${loser.name}" into "${survivor.name}": move its ${describeVendorUsage(usage)} onto ` +
      `"${survivor.name}", then permanently delete "${loser.name}".`;
    const token = signProposal("merge_vendors", { loserId: loser.id, survivorId: survivor.id });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitMergeVendors: Committer = async (_user, args) => {
  const res = await mergeVendorsAction({ loserId: String(args.loserId), survivorId: String(args.survivorId) });
  const data = unwrap(res); // ActionError (incl. an un-acknowledged QBO conflict) re-throws with its user-safe message
  return {
    message: `Merged the vendors (moved ${describeVendorUsage(data.moved)}).`,
    navigate: { path: "/setup/vendors", label: "View vendors" },
  };
};
