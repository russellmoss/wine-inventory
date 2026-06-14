"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Avatar } from "@/components/ui";

type NavItem = { href: string; label: string; admin?: boolean };

const MAIN: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/bulk", label: "Bulk wine" },
  { href: "/bottling", label: "Bottling" },
  { href: "/inventory", label: "Inventory" },
  { href: "/reports", label: "Reports" },
  { href: "/audit", label: "Audit log", admin: true },
];

const SETUP: NavItem[] = [
  { href: "/vessels", label: "Vessels" },
  { href: "/locations", label: "Locations" },
  { href: "/reference", label: "Varieties & vineyards" },
  { href: "/users", label: "Users", admin: true },
];

const linkStyle = (active: boolean): React.CSSProperties => ({
  display: "block",
  padding: "9px 12px",
  borderRadius: "var(--radius-md)",
  fontFamily: "var(--font-body)",
  fontSize: 14.5,
  color: active ? "var(--accent-on)" : "var(--text-secondary)",
  background: active ? "var(--accent)" : "transparent",
  fontWeight: active ? 500 : 400,
});

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

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const setupActive = SETUP.some((s) => isActive(s.href));
  const [setupOpen, setSetupOpen] = React.useState(setupActive);
  React.useEffect(() => {
    if (setupActive) setSetupOpen(true);
  }, [setupActive]);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  const visibleSetup = SETUP.filter((s) => !s.admin || isAdmin);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--surface-page)" }}>
      <aside
        style={{
          width: 248, flex: "none", borderRight: "1px solid var(--border-strong)", background: "var(--surface-raised)",
          display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh",
        }}
      >
        <div style={{ padding: "24px 20px 16px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--text-primary)", lineHeight: 1.1 }}>Bhutan Wine</div>
          <div className="ds-eyebrow" style={{ marginTop: 6 }}>Inventory</div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", flex: 1, overflowY: "auto" }}>
          {MAIN.filter((n) => !n.admin || isAdmin).map((n) => (
            <Link key={n.href} href={n.href} style={linkStyle(isActive(n.href))}>{n.label}</Link>
          ))}

          {visibleSetup.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => setSetupOpen((o) => !o)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 12px", border: "none", background: "transparent", cursor: "pointer",
                  fontFamily: "var(--font-body)", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "var(--text-muted)", fontWeight: 600,
                }}
              >
                Setup
                <span style={{ transition: "transform 0.15s", transform: setupOpen ? "rotate(90deg)" : "none" }}>›</span>
              </button>
              {setupOpen ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 6 }}>
                  {visibleSetup.map((n) => <Link key={n.href} href={n.href} style={linkStyle(isActive(n.href))}>{n.label}</Link>)}
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>

        <div style={{ borderTop: "1px solid var(--border-strong)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={user.name || user.email} size={34} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</div>
            <button onClick={handleSignOut} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12.5, color: "var(--text-accent)", fontFamily: "var(--font-body)" }}>Sign out</button>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "32px 40px" }}>{children}</div>
      </main>
    </div>
  );
}
