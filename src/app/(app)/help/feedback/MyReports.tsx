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
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
