import { FeedbackForm } from "./FeedbackForm";

export default function HelpFeedbackPage() {
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
      <FeedbackForm />
    </div>
  );
}
