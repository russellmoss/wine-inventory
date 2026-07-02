import "server-only";
import { prisma } from "@/lib/prisma";
import type { AssistantTool } from "../registry";
import { deterministicAnomalies, deterministicExciseAnomalies, hasFilingBlocker } from "@/lib/compliance/anomaly";
import { OPS_FORM, EXCISE_FORM, formScope } from "@/lib/compliance/form-type";
import type { ComputedSnapshot } from "@/lib/compliance/generate";
import type { ExciseComputed } from "@/lib/compliance/excise";

// Unit 11 / plan-026 U9 — read-only assistant tool answering "am I ready to file my TTB report?".
// Reuses the existing tool-use loop (no new LLM plumbing). It reads the latest persisted report of
// EACH form (tenant-scoped by RLS, formType-scoped so the two forms never cross — C4) and runs the
// DETERMINISTIC anomaly checks — advisory, never files anything.

export const reportAnomaliesTool: AssistantTool = {
  name: "report_anomalies",
  description:
    "Check the latest TTB compliance filings for problems and answer whether they're ready to file. Covers BOTH the Report of Wine Premises Operations (5120.17) and the Wine Excise Tax Return (5000.24, incl. what's owed). Call this when the user asks 'am I ready to file', 'how much wine tax do I owe', 'any issues with my TTB report', 'check my excise return', or about compliance filing readiness. Read-only; it never files.",
  kind: "read",
  adminOnly: true,
  inputSchema: { type: "object", properties: {} },
  async run() {
    const [ops, excise] = await Promise.all([
      prisma.complianceReport.findFirst({
        where: { ...formScope(OPS_FORM) },
        orderBy: [{ generatedAt: "desc" }],
        select: { id: true, periodEnd: true, status: true, version: true, computed: true },
      }),
      prisma.complianceReport.findFirst({
        where: { ...formScope(EXCISE_FORM) },
        orderBy: [{ generatedAt: "desc" }],
        select: { id: true, periodStart: true, periodEnd: true, status: true, version: true, computed: true },
      }),
    ]);

    if (!ops && !excise) {
      return { message: "No TTB report has been generated yet. Open the Compliance screen and generate the 5120.17 operations report or the 5000.24 excise return." };
    }

    const operations = ops
      ? (() => {
          const snap = ops.computed as unknown as ComputedSnapshot;
          const findings = deterministicAnomalies({ snapshot: snap });
          return {
            form: "TTB 5120.17 (operations)",
            period: ops.periodEnd.toISOString().slice(0, 7),
            status: ops.status,
            balances: snap.balanced,
            readyToFile: ops.status !== "FILED" && !hasFilingBlocker(findings),
            blockers: findings.filter((f) => f.severity === "blocker").map((b) => b.message),
            warnings: findings.filter((f) => f.severity === "warning").map((w) => w.message),
          };
        })()
      : null;

    const exciseReturn = excise
      ? (() => {
          const snap = excise.computed as unknown as ExciseComputed;
          const findings = deterministicExciseAnomalies({ snapshot: snap });
          return {
            form: "TTB 5000.24 (excise tax)",
            period: `${excise.periodStart.toISOString().slice(0, 10)} → ${excise.periodEnd.toISOString().slice(0, 10)}`,
            status: excise.status,
            amountToPay: `$${snap.netTax.toFixed(2)}`,
            cbmaCredit: `$${snap.cbmaCredit.toFixed(2)}`,
            readyToFile: excise.status !== "FILED" && !hasFilingBlocker(findings),
            blockers: findings.filter((f) => f.severity === "blocker").map((b) => b.message),
            warnings: findings.filter((f) => f.severity === "warning").map((w) => w.message),
          };
        })()
      : null;

    return {
      operations,
      exciseReturn,
      note: "Advisory only — not compliance advice, not reviewed by TTB. Confirm the numbers yourself, then file (Pay.gov for the excise return). Nothing is auto-submitted.",
    };
  },
};
