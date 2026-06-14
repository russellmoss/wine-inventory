import Link from "next/link";

// Temporary landing for Milestone A. Unit 5 replaces "/" with the protected
// dashboard (src/app/(app)/page.tsx) behind the auth gate.
export default function Home() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: 24,
        textAlign: "center",
      }}
    >
      <span className="ds-eyebrow">Bhutan Wine Company</span>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 56, lineHeight: 1.05 }}>
        Inventory
      </h1>
      <p style={{ color: "var(--text-secondary)", maxWidth: "48ch" }}>
        Bulk, bottled, and finished-goods inventory with full traceability.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <Link
          href="/login"
          style={{
            padding: "12px 22px",
            borderRadius: "var(--radius-md)",
            background: "var(--accent)",
            color: "var(--accent-on)",
            fontFamily: "var(--font-body)",
            fontWeight: 500,
          }}
        >
          Sign in
        </Link>
        <Link
          href="/styleguide"
          style={{
            padding: "12px 22px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
          }}
        >
          Design system
        </Link>
      </div>
    </div>
  );
}
