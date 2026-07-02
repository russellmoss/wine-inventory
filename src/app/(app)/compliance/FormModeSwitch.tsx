import Link from "next/link";

// plan-026 Unit 10 (D2) — the form-type mode switch. This is a top-level MODE, not a buried dropdown:
// it changes the whole screen (operations report ↔ excise return), so it reads as a segmented control
// with the active form visually dominant. Driven by ?formType=; server-rendered with aria-current.

const seg: React.CSSProperties = {
  padding: "8px 16px",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  fontSize: 14,
  fontWeight: 500,
  textDecoration: "none",
  borderRadius: "var(--radius-md)",
};

export function FormModeSwitch({ active }: { active: "TTB_5120_17" | "TTB_5000_24" }) {
  const item = (key: "TTB_5120_17" | "TTB_5000_24", label: string, sub: string) => {
    const on = active === key;
    return (
      <Link
        href={`/compliance?formType=${key}`}
        aria-current={on ? "page" : undefined}
        style={{
          ...seg,
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 1,
          background: on ? "var(--surface-raised)" : "transparent",
          color: on ? "var(--text-primary)" : "var(--text-muted)",
          border: on ? "1px solid var(--border-strong)" : "1px solid transparent",
          boxShadow: on ? "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.06))" : undefined,
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>{sub}</span>
      </Link>
    );
  };
  return (
    <div
      role="group"
      aria-label="Compliance form"
      style={{ display: "inline-flex", gap: 4, padding: 4, borderRadius: "var(--radius-lg, 12px)", background: "var(--surface-sunken)", marginBottom: 18 }}
    >
      {item("TTB_5120_17", "Operations", "Form 5120.17 · gallons")}
      {item("TTB_5000_24", "Excise tax", "Form 5000.24 · dollars")}
    </div>
  );
}
