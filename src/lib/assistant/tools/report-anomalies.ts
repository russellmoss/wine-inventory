import "server-only";
import { prisma } from "@/lib/prisma";
import type { AssistantTool } from "../registry";
import { deterministicAnomalies, hasFilingBlocker } from "@/lib/compliance/anomaly";
import type { ComputedSnapshot } from "@/lib/compliance/generate";

// Unit 11 — read-only assistant tool answering "am I ready to file my TTB report?". Reuses the
// existing tool-use loop (no new LLM plumbing). It reads the latest persisted report (tenant-scoped
// by RLS) and runs the DETERMINISTIC anomaly checks — advisory, never files anything.

export const reportAnomaliesTool: AssistantTool = {
  name: "report_anomalies",
  description:
    "Check the latest TTB Report of Wine Premises Operations (Form 5120.17) for problems and answer whether it's ready to file. Call this when the user asks 'am I ready to file', 'any issues with my TTB report', 'check my wine report', or about compliance filing readiness. Read-only; it never files.",
  kind: "read",
  adminOnly: true,
  inputSchema: { type: "object", properties: {} },
  async run() {
    const report = await prisma.complianceReport.findFirst({
      orderBy: [{ generatedAt: "desc" }],
      select: { id: true, periodStart: true, periodEnd: true, status: true, version: true, computed: true, remarks: true },
    });
    if (!report) {
      return { message: "No TTB report has been generated yet. Open the Compliance screen and generate one for the period you want to review." };
    }
    const snapshot = report.computed as unknown as ComputedSnapshot;
    const findings = deterministicAnomalies({ snapshot });
    const blockers = findings.filter((f) => f.severity === "blocker");
    const period = report.periodEnd.toISOString().slice(0, 7);
    return {
      period,
      status: report.status,
      version: report.version,
      balances: snapshot.balanced,
      a13EqualsB2: snapshot.a13EqualsB2,
      readyToFile: report.status !== "FILED" && !hasFilingBlocker(findings),
      blockers: blockers.map((b) => b.message),
      warnings: findings.filter((f) => f.severity === "warning").map((w) => w.message),
      note:
        report.status === "FILED"
          ? "This report is already filed (immutable)."
          : blockers.length
            ? "Not ready to file — resolve the blockers, then regenerate."
            : "No hard blockers. Review the figures and Part X, then you can mark it filed. (Not compliance advice — confirm the numbers yourself.)",
    };
  },
};
