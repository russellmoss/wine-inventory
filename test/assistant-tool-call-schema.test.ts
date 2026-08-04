import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";

/**
 * Plan 107 Unit 1a — the PII boundary on `assistant_tool_call` is STRUCTURAL, and this is what
 * enforces it. The table records that a tool was dispatched; it must never record what the user
 * said, what was passed to the tool, or what came back.
 *
 * This matters more here than on most tables. `sanitizeTraceValue` (trace.ts) redacts by key NAME
 * only, so an argument-shaped value can carry a person's name straight through — that is precisely
 * why the existing assistant trace is unsafe to aggregate, and why this table exists instead of a
 * query over it. A future "just add the args, it'd be useful" column would silently rebuild the
 * problem. It fails here, at the schema, before a single row can be written.
 *
 * Pure + DB-free (reads Prisma's datamodel), so it runs in normal CI.
 */

const PII_SHAPED =
  /(^|_)(input|inputs|args|arguments|params|payload|result|results|output|preview|content|message|text|utterance|prompt|query|note|notes|body)($|_)/i;

describe("assistant_tool_call PII data-minimization (plan 107 Unit 1a)", () => {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "AssistantToolCall");

  it("the model exists in the datamodel", () => {
    expect(model, "AssistantToolCall missing — did prisma generate run?").toBeTruthy();
  });

  it("has NO column capable of holding user free text", () => {
    const offenders = (model?.fields ?? []).map((f) => f.name).filter((n) => PII_SHAPED.test(n));
    expect(
      offenders,
      `PII-capable columns on AssistantToolCall: ${offenders.join(", ") || "(none)"}. ` +
        "This table records THAT a tool ran, never WHAT was said or passed. Put it elsewhere.",
    ).toEqual([]);
  });

  // Pin the exact surface. A new column is not forbidden, but it must be a deliberate decision that
  // updates this list — which is the moment someone re-reads the PII rule above.
  it("carries exactly the intended columns", () => {
    const names = (model?.fields ?? []).map((f) => f.name).sort();
    expect(names).toEqual(
      ["conversationId", "createdAt", "id", "modelTurn", "tenantId", "toolKind", "toolName", "userEmail", "userId"].sort(),
    );
  });

  it("is tenant-scoped with a tenant-leading index (TENANT-1 / Phase 12 step 1)", () => {
    expect((model?.fields ?? []).map((f) => f.name)).toContain("tenantId");

    // The runtime DMMF exposes only { models, enums, types } — no index information — so this reads
    // the schema source instead. That is the stronger assertion anyway: it pins the declaration a
    // reviewer actually sees.
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const block = /model AssistantToolCall \{([\s\S]*?)\n\}/.exec(schema)?.[1];
    expect(block, "AssistantToolCall block not found in schema.prisma").toBeTruthy();

    const indexes = [...(block ?? "").matchAll(/@@index\(\[([^\]]+)\]/g)].map((m) =>
      m[1].split(",").map((s) => s.trim()),
    );
    expect(indexes.length, "expected at least one @@index").toBeGreaterThan(0);
    // Every read is RLS-scoped to one tenant, so a tenant-leading index is the only shape the
    // planner can actually use. A non-tenant-leading index here is dead weight.
    for (const fields of indexes) {
      expect(fields[0], `index [${fields.join(", ")}] is not tenant-leading`).toBe("tenantId");
    }
  });

  it("does NOT foreign-key the conversation (a logging write must not break a chat turn)", () => {
    const conv = (model?.fields ?? []).find((f) => f.name === "conversationId");
    expect(conv?.relationName, "conversationId must be a plain string, not a relation").toBeUndefined();
    expect(conv?.isRequired, "conversationId is nullable — a turn can have no conversation").toBe(false);
  });
});
