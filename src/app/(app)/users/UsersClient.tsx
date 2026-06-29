"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow } from "@/components/ui";
import { createUser, resetUserPassword, setUserRole, setUserBanned, setUserVineyards } from "@/lib/users/actions";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  banned: boolean;
  mustChangePassword: boolean;
  isSelf: boolean;
  vineyardIds: string[];
};

export type VineyardOption = { id: string; name: string };

const selectStyle: React.CSSProperties = {
  height: 36,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};

export function UsersClient({ users, vineyards }: { users: UserRow[]; vineyards: VineyardOption[] }) {
  const [error, setError] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<{ email: string; tempPassword: string; emailed?: boolean } | null>(null);
  const [pending, startTransition] = React.useTransition();

  function run(fn: () => Promise<unknown>, form?: HTMLFormElement) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res && typeof res === "object" && "tempPassword" in res) {
          setSecret(res as { email: string; tempPassword: string; emailed?: boolean });
        }
        form?.reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      <Eyebrow rule>Admin</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Users</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "64ch" }}>
        Create accounts with a temporary password. Each new user must set their own password on
        first sign-in. Deactivating a user revokes their sessions immediately.
      </p>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p> : null}

      {secret ? (
        <Card style={{ marginBottom: 20, borderColor: "var(--accent)" }}>
          <strong>Temporary password for {secret.email}</strong>
          <p style={{ margin: "8px 0", color: "var(--text-secondary)", fontSize: 14 }}>
            {secret.emailed
              ? "We emailed these sign-in details to the user. This copy is a backup — they'll be required to change the password at first sign-in."
              : "Couldn't email the user — share this with them directly. They'll be required to change it at first sign-in."}
          </p>
          <code style={{ fontSize: 16, background: "var(--surface-sunken)", padding: "6px 12px", borderRadius: "var(--radius-sm)" }}>
            {secret.tempPassword}
          </code>
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" size="sm" onClick={() => setSecret(null)}>Dismiss</Button>
          </div>
        </Card>
      ) : null}

      <Card style={{ marginBottom: 24, maxWidth: 680 }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, marginBottom: 12 }}>Add a user</h2>
        <form
          onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; run(() => createUser(new FormData(f)), f); }}
          style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}
        >
          <Input label="Email" name="email" type="email" required style={{ flex: "1 1 200px" }} />
          <Input label="Name" name="name" placeholder="optional" style={{ flex: "1 1 150px" }} />
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Role</span>
            <select name="role" defaultValue="user" style={{ ...selectStyle, height: 44 }}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <Button type="submit" variant="primary" disabled={pending}>Create</Button>
        </form>
      </Card>

      <Card padding="0">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>User</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Role</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Vineyard</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Status</th>
              <th style={{ padding: "12px 16px", fontWeight: 500, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--border-strong)", opacity: u.banned ? 0.55 : 1 }}>
                <td style={{ padding: "12px 16px" }}>
                  <div>{u.name}{u.isSelf ? " (you)" : ""}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{u.email}</div>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <Badge tone={u.role === "admin" ? "gold" : "neutral"} variant="soft">{u.role}</Badge>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 132, overflowY: "auto" }}>
                    {vineyards.length === 0 ? (
                      <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>No vineyards</span>
                    ) : (
                      vineyards.map((v) => {
                        const checked = u.vineyardIds.includes(v.id);
                        return (
                          <label key={v.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, cursor: pending ? "default" : "pointer" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={pending}
                              onChange={() => {
                                const next = checked
                                  ? u.vineyardIds.filter((id) => id !== v.id)
                                  : [...u.vineyardIds, v.id];
                                run(() => setUserVineyards(u.id, next));
                              }}
                            />
                            <span>{v.name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {u.banned ? <Badge tone="red" variant="soft">deactivated</Badge>
                    : u.mustChangePassword ? <Badge tone="blue" variant="soft">awaiting first login</Badge>
                    : <Badge tone="green" variant="soft">active</Badge>}
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => resetUserPassword(u.id))}>reset pw</Button>
                  {!u.isSelf ? (
                    <>
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setUserRole(u.id, u.role === "admin" ? "user" : "admin"))}>
                        make {u.role === "admin" ? "user" : "admin"}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setUserBanned(u.id, !u.banned))}>
                        {u.banned ? "reactivate" : "deactivate"}
                      </Button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
