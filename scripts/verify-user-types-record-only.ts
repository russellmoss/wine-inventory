import { runAsTenant } from "@/lib/tenant/context";
import { resolveTaskVocabulary } from "@/lib/work-orders/vocabulary-resolver";
import { assertUserTaskTypeSafe } from "@/lib/work-orders/vocabulary-resolver";
import { customLogToTaskDef } from "@/lib/work-orders/custom-log-fields";
import { disconnectSystem } from "@/lib/tenant/system";

// Plan 053 C13 — WORKORDER-4 guard: a tenant-authored task type (Custom Log) is RECORD-ONLY. It can never
// resolve to anything but a NOTE, and can never carry a ledger opType / observation / maintenance activity.
// If this ever fails, a user type could reach the immutable ledger / cost / measurement store.

const DEMO = "org_demo_winery";
let failures = 0;
function check(desc: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${desc}`);
  if (!ok) failures++;
}

async function main() {
  // 1. STRUCTURAL: the mapper can never produce a non-NOTE def, even from adversarial stored JSON that tries
  //    to smuggle an opType/kind. customLogToTaskDef always sets kind NOTE and ignores extra keys.
  const adversarial = customLogToTaskDef({ label: "evil", fieldsJson: [{ key: "x", label: "X", type: "text", opType: "ADDITION", kind: "OPERATION" }] as unknown });
  check("customLogToTaskDef always yields a NOTE (adversarial JSON ignored)", adversarial.kind === "NOTE" && adversarial.opType == null);
  let threw = false;
  try { assertUserTaskTypeSafe({ kind: "OPERATION", opType: "ADDITION" }); } catch { threw = true; }
  check("assertUserTaskTypeSafe rejects a non-NOTE / opType-bearing type", threw);

  // 2. LIVE: every resolved user-defined type in the demo tenant is a safe NOTE (no opType/obs/activity).
  const vocab = await runAsTenant(DEMO, () => resolveTaskVocabulary(DEMO));
  const userDefs = Object.entries(vocab).filter(([, d]) => d.isUserDefined);
  const allSafe = userDefs.every(([, d]) => d.kind === "NOTE" && d.opType == null && d.observationType == null && d.activityType == null);
  check(`all resolved user-defined types are record-only NOTE (${userDefs.length} checked)`, allSafe);

  if (failures > 0) { console.error(`\nWORKORDER-4 VIOLATED: ${failures} check(s) failed.`); process.exit(1); }
  console.log("\nWORKORDER-4 OK — user-defined task types are record-only ✓");
}

main().then(() => disconnectSystem()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
