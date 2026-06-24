"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Avatar } from "@/components/ui";
import { BrandMark, BrandEmblem } from "@/components/BrandMark";

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
        <BrandMark />
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

  // Respond to navigation during render (React's sanctioned pattern) rather than
  // in an effect: expand the Setup group when entering a setup route, and close
  // the mobile drawer whenever the path changes.
  const [prevSetupActive, setPrevSetupActive] = React.useState(setupActive);
  if (setupActive !== prevSetupActive) {
    setPrevSetupActive(setupActive);
    if (setupActive) setSetupOpen(true);
  }
  const [prevPathname, setPrevPathname] = React.useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setDrawer(false);
  }

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  // NOTE: no `display` here — the responsive classes own it (inline display would override them).
  const sidebarBox: React.CSSProperties = {
    width: 248, flex: "none", borderRight: "1px solid var(--border-strong)", background: "var(--surface-raised)",
    flexDirection: "column",
  };

  return (
    <div className="bw-shell" style={{ minHeight: "100vh", background: "var(--surface-page)" }}>
      {/* Mobile top bar (hidden on desktop via .bw-mobile-bar) */}
      <header
        className="bw-mobile-bar"
        style={{
          position: "sticky", top: 0, zIndex: 30, alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", background: "var(--surface-raised)", borderBottom: "1px solid var(--border-strong)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <BrandEmblem size={24} />
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: "0.01em" }}>BWC</div>
        </div>
        <button onClick={() => setDrawer(true)} aria-label="Open menu" style={{ background: "none", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", padding: "6px 10px", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>☰</button>
      </header>

      {/* Desktop sidebar (hidden on mobile via .bw-desktop-sidebar) */}
      <aside className="bw-desktop-sidebar" style={{ ...sidebarBox, position: "sticky", top: 0, height: "100vh" }}>
        <SidebarContent user={user} isActive={isActive} isAdmin={isAdmin} setupOpen={setupOpen} setSetupOpen={setSetupOpen} onNavigate={() => {}} onSignOut={handleSignOut} />
      </aside>

      {/* Mobile drawer */}
      {drawer ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
          <div onClick={() => setDrawer(false)} style={{ position: "absolute", inset: 0, background: "rgba(20,19,15,0.45)" }} />
          <aside style={{ ...sidebarBox, display: "flex", position: "absolute", left: 0, top: 0, height: "100%", width: 264, boxShadow: "var(--shadow-xl)" }}>
            <button onClick={() => setDrawer(false)} aria-label="Close menu" style={{ position: "absolute", right: 10, top: 10, background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-muted)", zIndex: 1 }}>×</button>
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
