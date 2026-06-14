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
  padding: "10px 12px",
  borderRadius: "var(--radius-md)",
  fontFamily: "var(--font-body)",
  fontSize: 14.5,
  color: active ? "var(--accent-on)" : "var(--text-secondary)",
  background: active ? "var(--accent)" : "transparent",
  fontWeight: active ? 500 : 400,
});

function SidebarContent({
  user,
  isActive,
  isAdmin,
  setupOpen,
  setSetupOpen,
  onNavigate,
  onSignOut,
}: {
  user: { name?: string | null; email: string; role?: string | null };
  isActive: (href: string) => boolean;
  isAdmin: boolean;
  setupOpen: boolean;
  setSetupOpen: (fn: (o: boolean) => boolean) => void;
  onNavigate: () => void;
  onSignOut: () => void;
}) {
  const visibleSetup = SETUP.filter((s) => !s.admin || isAdmin);
  return (
    <>
      <div style={{ padding: "20px 20px 12px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--text-primary)", lineHeight: 1.1 }}>Bhutan Wine</div>
        <div className="ds-eyebrow" style={{ marginTop: 6 }}>Inventory</div>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", flex: 1, overflowY: "auto" }}>
        {MAIN.filter((n) => !n.admin || isAdmin).map((n) => (
          <Link key={n.href} href={n.href} onClick={onNavigate} style={linkStyle(isActive(n.href))}>{n.label}</Link>
        ))}
        {visibleSetup.length > 0 ? (
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => setSetupOpen((o) => !o)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px",
                border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 12,
                letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600,
              }}
            >
              Setup
              <span style={{ transition: "transform 0.15s", transform: setupOpen ? "rotate(90deg)" : "none" }}>›</span>
            </button>
            {setupOpen ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 6 }}>
                {visibleSetup.map((n) => <Link key={n.href} href={n.href} onClick={onNavigate} style={linkStyle(isActive(n.href))}>{n.label}</Link>)}
              </div>
            ) : null}
          </div>
        ) : null}
      </nav>
      <div style={{ borderTop: "1px solid var(--border-strong)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name={user.name || user.email} size={34} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</div>
          <button onClick={onSignOut} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12.5, color: "var(--text-accent)", fontFamily: "var(--font-body)" }}>Sign out</button>
        </div>
      </div>
    </>
  );
}

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
  const [drawer, setDrawer] = React.useState(false);
  React.useEffect(() => { if (setupActive) setSetupOpen(true); }, [setupActive]);
  React.useEffect(() => { setDrawer(false); }, [pathname]); // close drawer on navigation

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  const sidebarBox: React.CSSProperties = {
    width: 248, flex: "none", borderRight: "1px solid var(--border-strong)", background: "var(--surface-raised)",
    display: "flex", flexDirection: "column",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-page)" }} className="md:flex">
      {/* Mobile top bar */}
      <header
        className="md:hidden"
        style={{
          position: "sticky", top: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", background: "var(--surface-raised)", borderBottom: "1px solid var(--border-strong)",
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Bhutan Wine</div>
        <button onClick={() => setDrawer(true)} aria-label="Open menu" style={{ background: "none", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", padding: "6px 10px", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>☰</button>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex" style={{ ...sidebarBox, position: "sticky", top: 0, height: "100vh" }}>
        <SidebarContent user={user} isActive={isActive} isAdmin={isAdmin} setupOpen={setupOpen} setSetupOpen={setSetupOpen} onNavigate={() => {}} onSignOut={handleSignOut} />
      </aside>

      {/* Mobile drawer */}
      {drawer ? (
        <div className="md:hidden" style={{ position: "fixed", inset: 0, zIndex: 50 }}>
          <div onClick={() => setDrawer(false)} style={{ position: "absolute", inset: 0, background: "rgba(20,19,15,0.45)" }} />
          <aside style={{ ...sidebarBox, position: "absolute", left: 0, top: 0, height: "100%", width: 264, boxShadow: "var(--shadow-xl)" }}>
            <button onClick={() => setDrawer(false)} aria-label="Close menu" style={{ position: "absolute", right: 10, top: 10, background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-muted)" }}>×</button>
            <SidebarContent user={user} isActive={isActive} isAdmin={isAdmin} setupOpen={setupOpen} setSetupOpen={setSetupOpen} onNavigate={() => setDrawer(false)} onSignOut={handleSignOut} />
          </aside>
        </div>
      ) : null}

      <main className="app-main" style={{ flex: 1, minWidth: 0 }}>
        <div className="mx-auto px-4 py-5 md:px-10 md:py-8" style={{ maxWidth: "var(--container-xl)" }}>{children}</div>
      </main>
    </div>
  );
}
