"use client";

import React from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth-client";
import { Card, Input, Button, Eyebrow } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    // redirectTo is where the email link lands after the token is validated.
    const { error } = await requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    // Always show the same confirmation — don't reveal whether an account exists.
    if (error && error.status !== 200) {
      setError(error.message || "Something went wrong. Try again.");
      return;
    }
    setSent(true);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Card padding="var(--space-7)" style={{ width: "100%", maxWidth: 400 }}>
        <Eyebrow rule>Bhutan Wine Company</Eyebrow>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "10px 0 16px" }}>Reset password</h1>

        {sent ? (
          <>
            <p style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>
              If an account exists for <strong>{email}</strong>, we&rsquo;ve sent a password reset link.
              Check your inbox (and spam) — the link expires in 1 hour.
            </p>
            <p style={{ marginTop: 20, textAlign: "center", fontSize: 13.5 }}>
              <Link href="/login" style={{ color: "var(--text-accent)", textDecoration: "none" }}>Back to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
              Enter your account email and we&rsquo;ll send you a link to reset your password.
            </p>
            <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
              <Button type="submit" variant="primary" fullWidth disabled={pending}>
                {pending ? "Sending..." : "Send reset link"}
              </Button>
            </form>
            <p style={{ marginTop: 16, textAlign: "center", fontSize: 13.5 }}>
              <Link href="/login" style={{ color: "var(--text-accent)", textDecoration: "none" }}>Back to sign in</Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
