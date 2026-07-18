"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { Card, Input, Button } from "@/components/ui";
import { BrandMark } from "@/components/BrandMark";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // The Google button is env-gated: it only renders when the server has Google creds configured
  // (mirrors the ELEVENLABS "Talk" button convention). Public flag → inlined at build.
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "1";
  // Better Auth redirects a failed social sign-in back here with an `error` query param. The common
  // case for this app is an un-provisioned Google account (disableSignUp refuses it), so we show one
  // actionable message that also covers a cancelled consent.
  const googleError = params.get("error");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { error } = await signIn.email({ email, password });
    setPending(false);
    if (error) {
      setError(error.message || "Sign in failed. Check your email and password.");
      return;
    }
    router.push(params.get("from") || "/");
    router.refresh();
  }

  async function onGoogle() {
    setError(null);
    setPending(true);
    // Better Auth handles the full OAuth redirect round-trip; on success it returns to callbackURL,
    // on failure to errorCallbackURL with an `error` param (read as `googleError` above).
    await signIn.social({
      provider: "google",
      callbackURL: params.get("from") || "/",
      errorCallbackURL: "/login",
    });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Card padding="var(--space-7)" style={{ width: "100%", maxWidth: 400 }}>
        <BrandMark variant="auth" />
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "20px 0 24px" }}>
          Sign in
        </h1>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            iconRight={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                  color: "var(--text-muted)",
                }}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            }
          />
          {error ? (
            <p style={{ color: "var(--danger)", fontSize: 13.5, margin: 0 }}>{error}</p>
          ) : null}
          <Button type="submit" variant="primary" fullWidth disabled={pending}>
            {pending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        {googleEnabled ? (
          <>
            {googleError ? (
              <p style={{ color: "var(--danger)", fontSize: 13.5, margin: "16px 0 0" }}>
                We couldn&apos;t complete Google sign-in. If your account isn&apos;t set up in Cellarhand
                yet, ask your admin to add you. Otherwise, try again.
              </p>
            ) : null}
            <div
              aria-hidden="true"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                margin: "18px 0",
                color: "var(--text-muted)",
                fontSize: 12.5,
              }}
            >
              <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
              or
              <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              disabled={pending}
              onClick={onGoogle}
              iconLeft={<GoogleIcon />}
            >
              Continue with Google
            </Button>
          </>
        ) : null}
        <p style={{ marginTop: 16, textAlign: "center", fontSize: 13.5 }}>
          <Link href="/forgot-password" style={{ color: "var(--text-accent)", textDecoration: "none" }}>
            Forgot password?
          </Link>
        </p>
      </Card>
    </div>
  );
}

function GoogleIcon() {
  // Google "G" — official four-color mark. Fixed brand colors (not design tokens) by design.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" fill="#34A853" />
      <path d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" fill="#FBBC05" />
      <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" fill="#EA4335" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
