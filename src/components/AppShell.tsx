"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Avatar } from "@/components/ui";

type NavItem = { href: string; label: string; admin?: boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/bulk", label: "Bulk wine" },
  { href: "/bottling", label: "Bottling" },
  { href: "/bottled", label: "Bottled" },
  { href: "/finished-goods", label: "Finished goods" },
  { href: "/reports", label: "Reports" },
  { href: "/vessels", label: "Vessels" },
  { href: "/locations", label: "Locations" },
  { href: "/reference", label: "Varieties & vineyards" },
  { href: "/users", label: "Users", admin: true },
  { href: "/audit", label: "Audit log", admin: true },
];

export function AppShell({
  user,
  children,
}: {
  user: { name?: string | null; email: string; role?: string | null };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = user.role === "admin";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--surface-page)" }}>
      <aside
        style={{
          width: 248,
          flex: "none",
          borderRight: "1px solid var(--border-strong)",
          background: "var(--surface-raised)",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div style={{ padding: "24px 20px 16px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--text-primary)", lineHeight: 1.1 }}>
            Bhutan Wine
          </div>
          <div className="ds-eyebrow" style={{ marginTop: 6 }}>
            Inventory
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", flex: 1, overflowY: "auto" }}>
          {NAV.filter((n) => !n.admin || isAdmin).map((n) => {
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  display: "block",
                  padding: "9px 12px",
                  borderRadius: "var(--radius-md)",
                  fontFamily: "var(--font-body)",
                  fontSize: 14.5,
                  color: active ? "var(--accent-on)" : "var(--text-secondary)",
                  background: active ? "var(--accent)" : "transparent",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div
          style={{
            borderTop: "1px solid var(--border-strong)",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Avatar name={user.name || user.email} size={34} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user.name || user.email}
            </div>
            <button
              onClick={handleSignOut}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 12.5,
                color: "var(--text-accent)",
                fontFamily: "var(--font-body)",
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "32px 40px" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
