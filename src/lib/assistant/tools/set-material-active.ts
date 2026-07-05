import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { pickMaterial } from "./material-picker";
import { materialDisplayName } from "@/lib/cellar/materials-shared";
import { setMaterialActiveAction } from "@/lib/cost/actions";

// Wave 3 (materials) — activate / deactivate a catalog material, wrapping setMaterialActiveCore. History-
// safe: a deactivate is never a hard delete (past ops keep their material snapshot). Resolves the material
// via the shared deterministic picker; includes inactive materials so a deactivated one can be reactivated.

type RawInput = { material?: string; active?: boolean };

export const setMaterialActiveTool: AssistantTool = {
  name: "set_material_active",
  description:
    "Activate or DEACTIVATE a material in the catalog (never a hard delete — past operations keep their record). Use for 'deactivate/retire/hide the old X supply' (active:false) or 'reactivate X' (active:true). Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      material: { type: "string", description: "The material by name, e.g. 'old tannin', 'ZZCOST KMBS'." },
      active: { type: "boolean", description: "true = reactivate; false = deactivate/retire." },
    },
    required: ["material", "active"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    if (!input.material || typeof input.material !== "string") throw new Error("Which material?");
    if (typeof input.active !== "boolean") throw new Error("Activate or deactivate it?");

    const res = await pickMaterial(input.material, "set_material_active", input, { includeInactive: true });
    if (res.kind === "choice") return res.choice;
    const m = res.row;

    const preview = `${input.active ? "Reactivate" : "Deactivate"} the material "${materialDisplayName(m)}".`;
    const token = signProposal("set_material_active", {
      materialId: m.id,
      active: input.active,
      materialLabel: materialDisplayName(m),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitSetMaterialActive: Committer = async (_user, args) => {
  await setMaterialActiveAction(String(args.materialId), args.active === true);
  return { message: `${args.active === true ? "Reactivated" : "Deactivated"} "${String(args.materialLabel ?? "the material")}".` };
};
