import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveLotTargetOrChoice } from "../scope";
import { changeOwnershipCore, previewChangeOwnership } from "@/lib/owner/change-ownership-core";
import { listOwnersCore, getOwnerCore, ownerLabel } from "@/lib/owner/data";

// Plan 093 Unit 12: change a lot's PROPRIETOR from chat. The highest-blast-radius ownership write, so it
// is D10 propose→confirm and the readback states WHICH legal outcome will happen (council C1): a same-bond
// change is a TITLE TRANSFER with zero TTB; a host↔AP change files a TRANSFER-IN-BOND. The operator must
// see that difference before confirming. "estate"/"facility" transfers the wine to the winery (NULL owner).

type ChangeOwnershipInput = { lot?: string; vessel?: string; newOwner?: string };

const FACILITY = /^(estate|facility|the facility|our own|the winery|winery|us)$/i;

export const changeOwnershipTool: AssistantTool = {
  name: "change_ownership",
  description:
    "Change the OWNER / proprietor of a lot — a custom-crush title transfer. Use when the user reassigns whose wine a lot is: 'change ownership of lot 24-CAB-1 to Smith Ranch', 'transfer this lot to the facility', 'this barrel is now Vega Wines'. Give the lot by code (or the vessel that holds it) and the new owner by name; say 'estate' or 'facility' to move it to the winery's own wine. This does NOT save immediately — it returns a preview that states whether it is a title-only transfer (no TTB) or a transfer-in-bond (files a TTB movement), which the user confirms.",
  kind: "write",
  adminOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      lot: { type: "string", description: "The lot code to reassign, e.g. '24-CAB-1'." },
      vessel: { type: "string", description: "Alternatively, the vessel that holds the lot (its single resident lot is used)." },
      newOwner: { type: "string", description: "The new owner's name (a custom-crush client), or 'estate'/'facility' to transfer the wine to the winery itself." },
    },
    required: ["newOwner"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as ChangeOwnershipInput;
    const resolved = await resolveLotTargetOrChoice({ lot: input.lot, vessel: input.vessel }, "change_ownership", input as Record<string, unknown>);
    if (resolved.kind === "choice") return resolved.choice;
    const { lotId, lotCode } = resolved.row;

    const raw = (input.newOwner ?? "").trim();
    let newOwnerId: string | null = null;
    let newOwnerLabel = "Estate (facility)";
    if (raw && !FACILITY.test(raw)) {
      const owners = await listOwnersCore();
      const matches = owners.filter((o) => o.name.toLowerCase().includes(raw.toLowerCase()));
      if (matches.length === 0) throw new Error(`No owner matches "${raw}". Add the client in setup first, or say "estate"/"facility" to transfer it to the winery.`);
      if (matches.length > 1) throw new Error(`"${raw}" matches ${matches.length} owners (${matches.map((m) => m.name).join(", ")}) — be more specific.`);
      newOwnerId = matches[0].id;
      newOwnerLabel = matches[0].name;
    }

    const preview = await previewChangeOwnership(lotId, newOwnerId);
    if ("error" in preview) throw new Error(preview.error);
    const oldLabel = ownerLabel(await getOwnerCore(preview.oldOwnerId));
    const legal =
      preview.kind === "TITLE_ONLY"
        ? "title transfer only — no TTB filing (same bond)"
        : "transfer in bond — files a TTB 5120.17 movement (different bond)";
    const previewStr = `Change ownership of lot ${lotCode} from ${oldLabel} to ${newOwnerLabel} — ${legal}.`;
    const token = signProposal("change_ownership", { lotId, lotCode, newOwnerId, newOwnerLabel });
    return { needsConfirmation: true, preview: previewStr, token };
  },
};

export const commitChangeOwnership: Committer = async (user, args) => {
  const res = await changeOwnershipCore(
    { actorUserId: user.id, actorEmail: user.email },
    { lotId: String(args.lotId), newOwnerId: args.newOwnerId ? String(args.newOwnerId) : null },
  );
  return { message: res.message };
};
