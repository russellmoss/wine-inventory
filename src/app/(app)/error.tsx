"use client";

import React from "react";
import { Button, Card } from "@/components/ui";

/**
 * Segment error boundary for the whole authenticated app.
 *
 * Every tenant-scoped page under (app) reads through the `prisma` extension, which
 * THROWS when it cannot resolve a tenant (src/lib/prisma.ts) — no ALS context and no
 * active organization on the session. That happens on a soft navigation to a data page
 * when the session's winery is no longer resolvable (support context expired, membership
 * revoked, a user with no active org). Without this boundary that surfaces as a raw 500;
 * with it, the user gets a recoverable screen and the rest of the app shell stays intact.
 *
 * Generic on purpose: Next.js REDACTS server error messages before they reach the client
 * in production (the same reason a thrown ActionError reads as an opaque error in prod), so
 * we cannot branch on the message here. We offer both a retry (transient failures) and a
 * re-sign-in (the tenant-resolution case, which a fresh session fixes).
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card role="alert" style={{ maxWidth: "32rem", margin: "var(--space-7) auto" }}>
      <h1 style={{ marginTop: 0 }}>This page could not load</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Something went wrong loading this page. If you were switching wineries or your
        session changed, signing in again usually fixes it. Your data is unchanged.
      </p>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <Button onClick={() => unstable_retry()}>Try again</Button>
        <Button
          variant="secondary"
          onClick={() => {
            window.location.href = "/login";
          }}
        >
          Sign in again
        </Button>
      </div>
    </Card>
  );
}
