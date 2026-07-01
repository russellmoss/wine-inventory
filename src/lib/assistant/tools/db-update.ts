import "server-only";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit, diff } from "@/lib/audit";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { getEntity, allowedEntityNames } from "../entities";
import { validateFields, type ValidatedValues } from "../fields";
import { resolveExactlyOne } from "./resolve";

type DbUpdateInput = { entity?: string; query?: string; id?: string; values?: Record<string, unknown> };

/** Managers may only touch their own vineyard's rows; global records are admin-only. */
function assertScoped(entity: { vineyardScoped: boolean }, user: { role: string | null; vineyardIds: string[] }, vineyardId: string | null) {
  if (entity.vineyardScoped) {
    if (user.role !== "admin" && (!vineyardId || !user.vineyardIds.includes(vineyardId))) {
      throw new Error("You can only edit records in your assigned vineyard.");
    }
  } else if (user.role !== "admin") {
    throw new Error("Only an admin can change global records.");
  }
}

export const dbUpdateTool: AssistantTool = {
  name: "db_update",
  description:
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
      row = resolveExactlyOne(matches, {
        describe: (m) => m.label,
        noneMsg: `No ${entity.displayName} matches "${input.query ?? ""}".`,
        manyMsg: `Several ${entity.displayName} records match`,
      });
    }
    assertScoped(entity, ctx.user, row.vineyardId);

    const values = validateFields(entity.editable, input.values ?? {}, "update");
    const before = (await entity.current(row.id)) ?? {};
    const parts = Object.entries(values).map(([k, v]) => `${k}: ${fmt(before[k])} → ${fmt(v)}`);
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
