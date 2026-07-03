"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Avatar } from "@/components/ui";
import { BrandMark } from "@/components/BrandMark";

type NavItem = { href: string; label: string; admin?: boolean; badge?: number };

const MAIN: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/assistant", label: "Assistant" },
  { href: "/inventory", label: "Inventory" },
  { href: "/reports", label: "Reports" },
  { href: "/compliance", label: "TTB compliance", admin: true },
  { href: "/accounting", label: "Accounting", admin: true },
  { href: "/audit", label: "Audit log", admin: true },
];

const WINERY: NavItem[] = [
  { href: "/bulk", label: "Wine in-progress" },
  { href: "/ferment/process", label: "De-stem & press" },
  { href: "/blend", label: "Blend" },
  { href: "/lots", label: "Lot timeline" },
  { href: "/samples", label: "Samples" },
  { href: "/bottling", label: "Bottling" },
];

const VINEYARDS: NavItem[] = [
  { href: "/vineyards/field-notes", label: "Field notes" },
  { href: "/vineyards/harvest", label: "Harvest" },
  { href: "/vineyards/maps", label: "Maps" },
];

const SETUP: NavItem[] = [
  { href: "/vessels", label: "Vessels" },
  { href: "/locations", label: "Locations" },
  { href: "/reference", label: "Varieties & vineyards" },
  { href: "/setup/expendables", label: "Expendables" },
  { href: "/settings", label: "Settings", admin: true },
  { href: "/users", label: "Users", admin: true },
];

// Phase 7 (K14): the En Tirage worklist only appears when the winery's sparkling program is on.
const EN_TIRAGE_NAV: NavItem = { href: "/cellar/en-tirage", label: "En Tirage" };

// Shared badge pill (nav counts). accent-soft/wine by default; overridden for urgent/active states.
const badgePill: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, minWidth: 18, height: 18, padding: "0 5px", borderRadius: "var(--radius-pill)",
  background: "var(--accent-soft)", color: "var(--wine-primary)", display: "inline-flex", alignItems: "center",
  justifyContent: "center", fontVariantNumeric: "tabular-nums",
};

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

function CollapsibleNavGroup({
  label,
  items,
  open,
  setOpen,
  isActive,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  open: boolean;
  setOpen: (fn: (o: boolean) => boolean) => void;
  isActive: (href: string) => boolean;
  onNavigate: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px",
          border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 12,
          letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600,
        }}
      >
        {label}
        <span style={{ transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "none" }}>›</span>
      </button>
      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 6 }}>
          {items.map((n) => (
            <Link key={n.href} href={n.href} onClick={onNavigate} style={{ ...linkStyle(isActive(n.href)), display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>{n.label}</span>
              {n.badge && n.badge > 0 ? (
                <span
                  aria-label={`${n.badge} pending`}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: "var(--radius-pill)",
                    background: "var(--accent-soft)",
                    color: "var(--wine-primary)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {n.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SidebarContent({
  user,
  isActive,
  isAdmin,
  wineryOpen,
  setWineryOpen,
  vineyardsOpen,
  setVineyardsOpen,
  setupOpen,
  setSetupOpen,
  onNavigate,
  onSignOut,
  pendingSamples,
  sparklingEnabled,
  complianceDeadlines,
}: {
  user: { name?: string | null; email: string; role?: string | null };
  isActive: (href: string) => boolean;
  isAdmin: boolean;
  wineryOpen: boolean;
  setWineryOpen: (fn: (o: boolean) => boolean) => void;
  vineyardsOpen: boolean;
  setVineyardsOpen: (fn: (o: boolean) => boolean) => void;
  setupOpen: boolean;
  setSetupOpen: (fn: (o: boolean) => boolean) => void;
  onNavigate: () => void;
  onSignOut: () => void;
  pendingSamples: number;
  sparklingEnabled: boolean;
  complianceDeadlines: { count: number; urgent: boolean };
}) {
  const visibleSetup = SETUP.filter((s) => !s.admin || isAdmin);
  const wineryItems = sparklingEnabled ? [...WINERY, EN_TIRAGE_NAV] : WINERY;
  const winery = wineryItems.map((n) => (n.href === "/samples" ? { ...n, badge: pendingSamples } : n));
  return (
    <>
      <div style={{ padding: "20px 20px 12px" }}>
        <BrandMark />
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", flex: 1, overflowY: "auto" }}>
        {MAIN.filter((n) => !n.admin || isAdmin).map((n) => {
          const active = isActive(n.href);
          const count = n.href === "/compliance" ? complianceDeadlines.count : 0;
          if (count <= 0) {
            return <Link key={n.href} href={n.href} onClick={onNavigate} style={linkStyle(active)}>{n.label}</Link>;
          }
          return (
            <Link key={n.href} href={n.href} onClick={onNavigate} style={{ ...linkStyle(active), display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>{n.label}</span>
              <span
                aria-label={`${count} filing deadline${count === 1 ? "" : "s"} due soon`}
                style={{
                  ...badgePill,
                  background: complianceDeadlines.urgent ? "var(--danger)" : active ? "var(--accent-on)" : "var(--accent-soft)",
                  color: complianceDeadlines.urgent ? "#fff" : "var(--wine-primary)",
                }}
              >
                {count}
              </span>
            </Link>
          );
        })}
        <CollapsibleNavGroup label="Winery" items={winery} open={wineryOpen} setOpen={setWineryOpen} isActive={isActive} onNavigate={onNavigate} />
        <CollapsibleNavGroup label="Vineyards" items={VINEYARDS} open={vineyardsOpen} setOpen={setVineyardsOpen} isActive={isActive} onNavigate={onNavigate} />
        <CollapsibleNavGroup label="Setup" items={visibleSetup} open={setupOpen} setOpen={setSetupOpen} isActive={isActive} onNavigate={onNavigate} />
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
  pendingSamples = 0,
  sparklingEnabled = false,
  complianceDeadlines = { count: 0, urgent: false },
}: {
  user: { name?: string | null; email: string; role?: string | null };
  children: React.ReactNode;
  pendingSamples?: number;
  sparklingEnabled?: boolean;
  complianceDeadlines?: { count: number; urgent: boolean };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = user.role === "admin";
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const wineryActive = isActive(EN_TIRAGE_NAV.href) || WINERY.some((s) => isActive(s.href));
  const vineyardsActive = VINEYARDS.some((s) => isActive(s.href));
  const setupActive = SETUP.some((s) => isActive(s.href));
  const [wineryOpen, setWineryOpen] = React.useState(wineryActive);
  const [vineyardsOpen, setVineyardsOpen] = React.useState(vineyardsActive);
  const [setupOpen, setSetupOpen] = React.useState(setupActive);
  const [drawer, setDrawer] = React.useState(false);

  // Respond to navigation during render (React's sanctioned pattern) rather than
  // in an effect: expand the relevant group when entering one of its routes, and
  // close the mobile drawer whenever the path changes.
  const [prevWineryActive, setPrevWineryActive] = React.useState(wineryActive);
  if (wineryActive !== prevWineryActive) {
    setPrevWineryActive(wineryActive);
    if (wineryActive) setWineryOpen(true);
  }
  const [prevVineyardsActive, setPrevVineyardsActive] = React.useState(vineyardsActive);
  if (vineyardsActive !== prevVineyardsActive) {
    setPrevVineyardsActive(vineyardsActive);
    if (vineyardsActive) setVineyardsOpen(true);
  }
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
          <BrandMark />
        </div>
        <button onClick={() => setDrawer(true)} aria-label="Open menu" style={{ background: "none", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", padding: "6px 10px", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>☰</button>
      </header>

      {/* Desktop sidebar (hidden on mobile via .bw-desktop-sidebar) */}
      <aside className="bw-desktop-sidebar" style={{ ...sidebarBox, position: "sticky", top: 0, height: "100vh" }}>
        <SidebarContent user={user} isActive={isActive} isAdmin={isAdmin} wineryOpen={wineryOpen} setWineryOpen={setWineryOpen} vineyardsOpen={vineyardsOpen} setVineyardsOpen={setVineyardsOpen} setupOpen={setupOpen} setSetupOpen={setSetupOpen} onNavigate={() => {}} onSignOut={handleSignOut} pendingSamples={pendingSamples} sparklingEnabled={sparklingEnabled} complianceDeadlines={complianceDeadlines} />
      </aside>

      {/* Mobile drawer */}
      {drawer ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
          <div onClick={() => setDrawer(false)} style={{ position: "absolute", inset: 0, background: "rgba(20,19,15,0.45)" }} />
          <aside style={{ ...sidebarBox, display: "flex", position: "absolute", left: 0, top: 0, height: "100%", width: 264, boxShadow: "var(--shadow-xl)" }}>
            <button onClick={() => setDrawer(false)} aria-label="Close menu" style={{ position: "absolute", right: 10, top: 10, background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-muted)", zIndex: 1 }}>×</button>
            <SidebarContent user={user} isActive={isActive} isAdmin={isAdmin} wineryOpen={wineryOpen} setWineryOpen={setWineryOpen} vineyardsOpen={vineyardsOpen} setVineyardsOpen={setVineyardsOpen} setupOpen={setupOpen} setSetupOpen={setSetupOpen} onNavigate={() => setDrawer(false)} onSignOut={handleSignOut} pendingSamples={pendingSamples} sparklingEnabled={sparklingEnabled} complianceDeadlines={complianceDeadlines} />
          </aside>
        </div>
      ) : null}

      <main className="app-main" style={{ flex: 1, minWidth: 0 }}>
        {pathname.startsWith("/assistant") ? (
          // Full-bleed: the assistant is a workspace, not a document — use the width.
          <div className="px-4 py-4 md:px-6 md:py-6" style={{ height: "100%" }}>{children}</div>
        ) : (
          <div className="mx-auto px-4 py-5 md:px-10 md:py-8" style={{ maxWidth: "var(--container-xl)" }}>{children}</div>
        )}
      </main>
    </div>
  );
}
