"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { Card, Input, Button, Eyebrow } from "@/components/ui";

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
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

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
        <Eyebrow rule>Bhutan Wine Company</Eyebrow>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "10px 0 24px" }}>
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
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? (
            <p style={{ color: "var(--danger)", fontSize: 13.5, margin: 0 }}>{error}</p>
          ) : null}
          <Button type="submit" variant="primary" fullWidth disabled={pending}>
            {pending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <p style={{ marginTop: 16, textAlign: "center", fontSize: 13.5 }}>
          <Link href="/forgot-password" style={{ color: "var(--text-accent)", textDecoration: "none" }}>
            Forgot password?
          </Link>
        </p>
      </Card>
    </div>
  );
}
