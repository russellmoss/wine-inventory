import { FeedbackPanel } from "./FeedbackPanel";
import { MyReports } from "./MyReports";
import { getMyReports } from "@/lib/feedback/my-reports";

export default async function HelpFeedbackPage() {
  const reports = await getMyReports();
  return (
    <div style={{ display: "grid", gap: "var(--space-5)", maxWidth: 820 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: "var(--text-h2)", margin: 0 }}>
          Help / feedback
        </h1>
        <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", marginTop: 6 }}>
          Send a bug report or feature request to the developer backlog.
        </p>
      </div>
      <FeedbackPanel />
      <MyReports reports={reports} />
    </div>
  );
}
