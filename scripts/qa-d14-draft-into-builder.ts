// QA proof for Plan 053 D14 — assistant custom-type fluency + draft-into-builder accelerator.
// Read-only draft path (no work order is created). Proves, against the REAL Demo Winery tenant vocabulary:
//   1. draftNlWorkOrderForBuilder returns editable TaskBuild[] ungated (even a not-fully-ready proposal),
//   2. a structured NOTE intent that names a tenant Custom Log resolves to THAT user task-type code
//      (this is the assistant path — the LLM emits structured intents), still NOTE-shaped,
//   3. the resolved user type is never a governed op (record-only safety line holds end to end),
//   4. an unmatched note stays a plain built-in NOTE.
// Creates its own QA-* Custom Log, archives it at the end. Run:
//   npx tsx --conditions=react-server --env-file=.env scripts/qa-d14-draft-into-builder.ts
const TENANT = "org_demo_winery";
const ACTOR = { actorUserId: null, actorEmail: "qa-d14@demo.com" };

async function main() {
  const { draftNlWorkOrderForBuilder } = await import("../src/lib/work-orders/nl-resolve");
  const { createUserTaskTypeCore, archiveUserTaskTypeCore } = await import("../src/lib/work-orders/custom-log");
  const { resolveTaskVocabulary } = await import("../src/lib/work-orders/vocabulary-resolver");

  let pass = 0;
  let fail = 0;
  const ok = (label: string, cond: boolean, extra?: unknown) => {
    if (cond) { pass++; console.log(`  ✓ ${label}`); }
    else { fail++; console.log(`  ✗ ${label}`, extra ?? ""); }
  };

  const label = `QA D14 Barrel Weigh ${Math.random().toString(36).slice(2, 6)}`;
  const created = await createUserTaskTypeCore(ACTOR, {
    label,
    fields: [{ key: "weight", label: "Weight", type: "number", dimension: "mass" }],
  });
  console.log(`  · created Custom Log ${created.code} (${label})`);
  try {
    // Structured intents = the assistant path (propose_work_order emits `tasks`). One plain NOTE + one that
    // names the tenant Custom Log. NOTE intents resolve with no vessel/material catalog dependency.
    const draft = await draftNlWorkOrderForBuilder({
      sourceText: `Shift handover, then ${label} on barrel 12`,
      tasks: [
        { kind: "NOTE", title: "Shift handover" },
        { kind: "NOTE", title: label, note: "barrel 12" },
      ],
    });
    const kinds = draft.taskBuilds.map((b) => b.taskType);
    ok("draft returns both editable task builds (ungated)", draft.taskBuilds.length === 2, kinds);

    const plainNote = draft.taskBuilds.find((b) => b.title === "Shift handover");
    ok("an unmatched note stays a plain built-in NOTE", plainNote?.taskType === "NOTE", plainNote?.taskType);

    const customBuild = draft.taskBuilds.find((b) => b.title === label);
    ok("a NOTE naming the Custom Log resolves to its user task-type code", customBuild?.taskType === created.code, customBuild?.taskType);

    const vocab = await resolveTaskVocabulary(TENANT);
    const def = vocab[created.code];
    ok("resolved user type exists in tenant vocabulary", !!def);
    ok("resolved user type is NOTE-shaped (record-only)", def?.kind === "NOTE", def?.kind);
    ok("resolved user type declares NO ledger opType", def?.opType == null, def?.opType);
    ok("resolved user type is flagged isUserDefined", def?.isUserDefined === true);
  } finally {
    await archiveUserTaskTypeCore(ACTOR, { id: created.id, active: false });
    console.log(`  · archived Custom Log ${created.code}`);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} D14 draft-into-builder: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

async function run() {
  const { runAsTenant } = await import("../src/lib/tenant/context");
  await runAsTenant(TENANT, () => main());
}
run().catch((e) => { console.error(e); process.exit(1); });
