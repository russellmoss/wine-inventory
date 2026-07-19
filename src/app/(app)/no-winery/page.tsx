import Link from "next/link";
import { Card } from "@/components/ui";

/**
 * Tenant-less landing for a session with no resolvable active winery — where `requireActiveTenant()`
 * sends a developer without a support session, or a user whose membership was revoked or isn't set up
 * yet. It reads NO tenant-scoped data, so it renders safely inside the (app) shell without tripping the
 * "Tenant context required" throw (Sentry #230) that every ordinary data page would.
 */
export default function NoWineryPage() {
  return (
    <Card role="status" style={{ maxWidth: "34rem", margin: "var(--space-7) auto" }}>
      <h1 style={{ marginTop: 0 }}>No active winery</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Your account isn&apos;t attached to a winery right now. Your session may have changed, or your
        access is still being set up. Signing in again usually restores it — if it keeps happening,
        contact your administrator.
      </p>
      <p style={{ marginBottom: 0 }}>
        <Link href="/login" style={{ color: "var(--text-accent)", fontWeight: 600 }}>
          Sign in again
        </Link>
      </p>
    </Card>
  );
}
