"use client";

import React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction, type ChangePasswordState } from "./actions";
import { Card, Input, Button, Eyebrow } from "@/components/ui";

const initial: ChangePasswordState = {};

export function ChangePasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(changePasswordAction, initial);

  React.useEffect(() => {
    if (state.ok) {
      router.push("/");
      router.refresh();
    }
  }, [state.ok, router]);

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
      <Card padding="var(--space-7)" style={{ width: "100%", maxWidth: 420 }}>
        <Eyebrow rule>Cellarhand</Eyebrow>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, margin: "10px 0 6px" }}>
          Set a new password
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 20 }}>
          Your account uses a temporary password. Choose a new one to continue.
        </p>
        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input
            label="Current (temporary) password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
          <Input
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters"
            required
          />
          <Input
            label="Confirm new password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
          />
          {state.error ? (
            <p style={{ color: "var(--danger)", fontSize: 13.5, margin: 0 }}>{state.error}</p>
          ) : null}
          <Button type="submit" variant="primary" fullWidth disabled={pending}>
            {pending ? "Saving..." : "Set password and continue"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
