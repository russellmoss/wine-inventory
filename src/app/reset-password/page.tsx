"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/auth-client";
import { Card, Input, Button, Eyebrow } from "@/components/ui";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const urlError = params.get("error");

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setPending(true);
    const { error } = await resetPassword({ newPassword: password, token });
    setPending(false);
    if (error) {
      setError(error.message || "Could not reset password. The link may have expired.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 1800);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Card padding="var(--space-7)" style={{ width: "100%", maxWidth: 400 }}>
        <Eyebrow rule>Bhutan Wine Company</Eyebrow>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "10px 0 16px" }}>Choose a new password</h1>

        {done ? (
          <p style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>
            Password updated. Redirecting you to sign in&hellip;
          </p>
        ) : !token || urlError ? (
          <>
            <p style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--danger)" }}>
              This reset link is invalid or has expired. Request a new one.
            </p>
            <p style={{ marginTop: 20, textAlign: "center", fontSize: 13.5 }}>
              <Link href="/forgot-password" style={{ color: "var(--text-accent)", textDecoration: "none" }}>Send a new link</Link>
            </p>
          </>
        ) : (
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label="New password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters" />
            <Input label="Confirm new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
            <Button type="submit" variant="primary" fullWidth disabled={pending}>
              {pending ? "Updating..." : "Update password"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
