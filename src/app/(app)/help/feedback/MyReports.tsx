import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { reporterStatus } from "@/lib/feedback/reporter-status";
import type { MyReport } from "@/lib/feedback/my-reports";

const KIND_LABEL: Record<string, string> = {
  BUG_REPORT: "Bug report",
  FEATURE_REQUEST: "Feature request",
  Assistant: "Assistant",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Reporter-facing "Your reports" list: what the signed-in user submitted and where each stands.
 * Presentational only — data comes from getMyReports() (own-only, tenant-scoped, reporter-safe).
 */
export function MyReports({ reports }: { reports: MyReport[] }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: "var(--text-h3)", margin: 0 }}>
        Your reports
      </h2>
      {reports.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: 0 }}>
          No reports yet. Anything you send above will show up here with its status.
        </p>
      ) : (
        <Card>
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {reports.map((r, index) => {
              const badge = reporterStatus(r.status);
              return (
                <div
                  key={`${r.sourceType}-${r.id}`}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "var(--space-3)",
                    paddingTop: index === 0 ? 0 : "var(--space-3)",
                    borderTop: index === 0 ? "none" : "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                    <span style={{ fontFamily: "var(--font-body)", color: "var(--text-primary)", fontWeight: "var(--weight-medium)" as unknown as number }}>
                      {r.title}
                    </span>
                    <span style={{ fontSize: "var(--text-body-sm)", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                      {KIND_LABEL[r.kind] ?? r.kind} · Submitted {formatDate(r.createdAt)}
                      {r.resolvedAt ? ` · Updated ${formatDate(r.resolvedAt)}` : ""}
                    </span>
                  </div>
                  {r.needsInput ? (
                    // Plan 079 D-1: the team asked a question and is waiting — point the reporter at their inbox.
                    <Link
                      href="/inbox?bucket=dm"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 10px",
                        borderRadius: "var(--radius-pill, 999px)",
                        border: "1px solid var(--accent)",
                        background: "var(--accent-soft, var(--surface-raised))",
                        color: "var(--accent)",
                        fontFamily: "var(--font-body)",
                        fontSize: "var(--text-body-sm)",
                        fontWeight: "var(--weight-medium)" as unknown as number,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                        minHeight: 32,
                      }}
                    >
                      Needs your input — check your inbox →
                    </Link>
                  ) : (
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
