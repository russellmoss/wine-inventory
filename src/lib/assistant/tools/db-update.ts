import "server-only";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit, diff } from "@/lib/audit";
import { isTenantAdminLike } from "@/lib/access";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal, signResume } from "../confirm";
import { getEntity, allowedEntityNames } from "../entities";
import { validateFields, type ValidatedValues } from "../fields";
import { resolveOneOrChoice } from "./resolve";

type DbUpdateInput = { entity?: string; query?: string; id?: string; values?: Record<string, unknown> };

/** Managers may only touch their own vineyard's rows; global records are admin-only. */
function assertScoped(entity: { vineyardScoped: boolean }, user: { role: string | null; vineyardIds: string[] }, vineyardId: string | null) {
  if (entity.vineyardScoped) {
    if (!isTenantAdminLike(user) && (!vineyardId || !user.vineyardIds.includes(vineyardId))) {
      throw new Error("You can only edit records in your assigned vineyard.");
    }
  } else if (!isTenantAdminLike(user)) {
    throw new Error("Only an admin or developer can change global records.");
  }
}

export const dbUpdateTool: AssistantTool = {
  name: "db_update",
  description:
    "ALWAYS call this when the user asks to change a field on a record — even if you are unsure WHICH record they mean. Do not list candidates or ask which one in prose first: an ambiguous query returns a CLICKABLE PICKER that pins the exact row by id, and a prose list gives the user nothing to act on — records with identical labels cannot be told apart by name at all. Calling this NEVER writes anything; it returns a preview to confirm. " +
    "Edit fields on an existing record. Resolve the row by entity + query (or exact id), then pass the fields to change in `values` (field name -> new value). Returns a preview of the before→after changes the user must confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      entity: { type: "string", description: "Entity type, e.g. 'VineyardBlock'." },
      query: { type: "string", description: "Search text to find the row." },
      id: { type: "string", description: "Exact row id, if known." },
      values: { type: "object", description: "Field names mapped to their new values.", additionalProperties: true },
    },
    required: ["entity", "values"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as DbUpdateInput;
    const entity = getEntity(input.entity ?? "");
    if (!entity || !entity.editable || !entity.update || !entity.current) {
      throw new Error(`Cannot edit "${input.entity ?? ""}". Editable entities: ${allowedEntityNames().join(", ")}.`);
    }

    let row;
    if (input.id) {
      row = await entity.load(input.id);
      if (!row) throw new Error(`No ${entity.displayName} with that id.`);
    } else {
      const matches = await entity.find(ctx.user, input.query ?? "");
      // Picker on ambiguity, not a thrown paragraph — the sibling of the db_delete fix (#328). Blocks are
      // reachable through this generic path too, and "Block 1" matches seven rows in a real winery.
      const res = resolveOneOrChoice(matches, {
        prompt: `Which ${entity.displayName} do you want to update?`,
        describe: (m) => m.label,
        resume: (m) => signResume("db_update", { ...input, id: m.id }),
        noneMsg: `No ${entity.displayName} matches "${input.query ?? ""}".`,
      });
      if (res.kind === "choice") return res.choice;
      row = res.row;
    }
    assertScoped(entity, ctx.user, row.vineyardId);

    let values = validateFields(entity.editable, input.values ?? {}, "update");
    if (entity.buildUpdate) {
      // FK names → ids, out here where an ambiguous name can still become a clickable picker.
      // `update` runs inside the transaction and cannot ask the user anything.
      const resolved = await entity.buildUpdate(ctx.user, values, row.id);
      if ("needsChoice" in resolved) return resolved;
      values = resolved;
    }
    const before = (await entity.current(row.id)) ?? {};
    const hidden = new Set(entity.internalUpdateKeys ?? []);
    const parts = Object.entries(values)
      .filter(([k]) => !hidden.has(k))
      .map(([k, v]) => `${k}: ${fmt(before[k])} → ${fmt(v)}`);
    const preview = `Update ${entity.displayName} "${row.label}" — ${parts.join(", ")}.`;
    const token = signProposal("db_update", { entity: entity.name, id: row.id, label: row.label, values });
    return { needsConfirmation: true, preview, token };
  },
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

export const commitDbUpdate: Committer = async (user, args) => {
  const entity = getEntity(String(args.entity ?? ""));
  if (!entity || !entity.update || !entity.current) throw new Error("That record can no longer be edited.");
  const id = String(args.id);
  const label = String(args.label ?? id);
  const values = (args.values ?? {}) as ValidatedValues;

  const row = await entity.load(id);
  if (!row) throw new Error(`That ${entity.displayName} no longer exists.`);
  assertScoped(entity, user, row.vineyardId);

  const before = (await entity.current(id)) ?? {};
  await runInTenantTx(async (tx) => {
    await entity.update!(tx, id, values);
    await writeAudit(tx, {
      actorUserId: user.id,
      actorEmail: user.email,
      action: "UPDATE",
      entityType: entity.name,
      entityId: id,
      changes: diff(before, { ...before, ...values }),
      summary: `Updated ${entity.displayName} ${label}`,
    });
  });
  return { message: `Updated ${entity.displayName} "${label}".` };
};
