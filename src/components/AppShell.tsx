"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { exitSupportTenant } from "@/lib/developer/actions";
import { isTenantAdminLike } from "@/lib/access";
import { Avatar, Button, LocalTime } from "@/components/ui";
import { NAV_MODEL, isVisible as navVisible } from "@/lib/nav/model";
import { NAV_V2_ENABLED } from "@/lib/nav/flag";
import { MobileTabBar } from "./MobileTabBar";
import { BrandMark } from "@/components/BrandMark";
import { AssistantDock } from "@/components/assistant/AssistantDock";
import { DevDiagnostics } from "@/components/observability/DevDiagnostics";
import { clearConsoleBuffer } from "@/lib/observability/console-buffer";

type NavItem = { href: string; label: string; admin?: boolean; developer?: boolean; customCrush?: boolean; badge?: number };

const MAIN: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/assistant", label: "Assistant" },
  { href: "/help/feedback", label: "Help / feedback" },
  { href: "/inventory", label: "Inventory" },
  { href: "/reports", label: "Reports" },
  { href: "/developer", label: "Developer", developer: true },
  { href: "/compliance", label: "TTB compliance", admin: true },
  { href: "/accounting", label: "Accounting", admin: true },
  { href: "/audit", label: "Audit log" },
];

const WINERY: NavItem[] = [
  { href: "/work-orders", label: "Work orders" },
  { href: "/bulk", label: "Wine in-progress" },
  { href: "/ferment/process", label: "De-stem & press" },
  { href: "/blend", label: "Blend" },
  { href: "/lots", label: "Lot timeline" },
  { href: "/samples", label: "Samples" },
  { href: "/bottling", label: "Bottling" },
  { href: "/winemaking-calculator", label: "Calculator" },
];

const VINEYARDS: NavItem[] = [
  { href: "/vineyards/field-notes", label: "Field notes" },
  { href: "/vineyards/harvest", label: "Harvest" },
  { href: "/vineyards/harvest/weigh-tags", label: "Weigh-tags", customCrush: true }, // Plan 093 (gated on the custom-crush program)
  { href: "/vineyards/maps", label: "Map Explorer" }, // VI — unified map surface: blocks + NDVI + soil layers (the old /vineyards/ndvi redirects here)
  { href: "/vineyards/weather", label: "Weather & climate" }, // VI-P8
  { href: "/vineyards/sprays", label: "Spray records" }, // Spray Intelligence S3a — the ONE nav entry (P8 lesson)
];

const SETUP: NavItem[] = [
  { href: "/vessels", label: "Vessels" },
  { href: "/locations", label: "Locations" },
  { href: "/reference", label: "Varieties & vineyards" },
  // Plan 080 U6: "Expendables" is gone from Setup — consumables now live in the unified Inventory page
  // (Inventory → Consumables), alongside finished goods and equipment. /setup/expendables redirects there.
  // Locations stays here for now: it has no section on the Inventory page yet and every intake depends on it.
  { href: "/setup/vendors", label: "Vendors" },
  { href: "/setup/growers", label: "Growers", admin: true }, // Plan 093 — always available (estate fruit has growers too)
  { href: "/setup/clients", label: "Clients", admin: true, customCrush: true }, // Plan 093 — custom-crush owners; gated on the program
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
  const bodyId = React.useId();
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px",
          border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 12,
          letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600,
        }}
      >
        {label}
        <span aria-hidden="true" style={{ transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "none" }}>›</span>
      </button>
      {open ? (
        <div id={bodyId} style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 6 }}>
          {items.map((n) => (
            <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={isActive(n.href) ? "page" : undefined} style={{ ...linkStyle(isActive(n.href)), display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
  isDeveloper,
  wineryOpen,
  setWineryOpen,
  vineyardsOpen,
  setVineyardsOpen,
  setupOpen,
  setSetupOpen,
  onNavigate,
  onSignOut,
  pendingSamples,
  pendingWorkOrders,
  sparklingEnabled,
  customCrushEnabled,
  complianceDeadlines,
  inboxEnabled,
  unreadMessages,
}: {
  user: { name?: string | null; email: string; role?: string | null; supportOrganizationId?: string | null; supportOrganizationName?: string | null; supportExpiresAt?: string | null };
  isActive: (href: string) => boolean;
  isAdmin: boolean;
  isDeveloper: boolean;
  wineryOpen: boolean;
  setWineryOpen: (fn: (o: boolean) => boolean) => void;
  vineyardsOpen: boolean;
  setVineyardsOpen: (fn: (o: boolean) => boolean) => void;
  setupOpen: boolean;
  setSetupOpen: (fn: (o: boolean) => boolean) => void;
  onNavigate: () => void;
  onSignOut: () => void;
  pendingSamples: number;
  pendingWorkOrders: number;
  sparklingEnabled: boolean;
  customCrushEnabled: boolean;
  complianceDeadlines: { count: number; urgent: boolean };
  inboxEnabled: boolean;
  unreadMessages: number;
}) {
  // v2 group open/closed state. Local to the sidebar rather than threaded through
  // props: the legacy groups keep their existing hoisted state, so the two nav
  // models never share state and turning the flag off cannot leave a stale value.
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});

  const gate = (n: NavItem) => (!n.admin || isAdmin) && (!n.developer || isDeveloper) && (!n.customCrush || customCrushEnabled);
  const visibleSetup = SETUP.filter(gate);
  const visibleVineyards = VINEYARDS.filter(gate);
  const wineryItems = sparklingEnabled ? [...WINERY, EN_TIRAGE_NAV] : WINERY;
  const winery = wineryItems.map((n) =>
    n.href === "/samples" ? { ...n, badge: pendingSamples } : n.href === "/work-orders" ? { ...n, badge: pendingWorkOrders } : n,
  );
  return (
    <>
      <div style={{ padding: "20px 20px 12px" }}>
        <BrandMark />
      </div>
      <nav aria-label="Main" style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", flex: 1, overflowY: "auto" }}>
      {/* Phase 3 (doc 01 §2): 3 groups, 13 destinations, ordered by frequency of
            use. The legacy 4-group / 31-entry sidebar is kept verbatim in the else
            branch — both paths ship in the same build, so rollback is an env change
            and a restart, not a revert commit while the crew is mid-harvest. */}
      {NAV_V2_ENABLED ? (
        NAV_MODEL.map((group) => {
          const ctx = { isAdmin, isDeveloper, hasVineyard: isAdmin };
          const visible = group.items.filter((d) => navVisible(d, ctx));
          if (visible.length === 0) return null;
          const badgeFor = (kind?: string) =>
            kind === "workOrders" ? pendingWorkOrders : kind === "compliance" ? complianceDeadlines.count : 0;
          return (
            <CollapsibleNavGroup
              key={group.id}
              label={group.label}
              items={visible.map((d) => ({ href: d.href, label: d.label, badge: badgeFor(d.badge) }))}
              open={openGroups[group.id] ?? group.defaultOpen}
              setOpen={(fn) => setOpenGroups((prev) => ({ ...prev, [group.id]: fn(prev[group.id] ?? group.defaultOpen) }))}
              isActive={isActive}
              onNavigate={onNavigate}
            />
          );
        })
      ) : (
        <>
          {MAIN.filter((n) => (!n.admin || isAdmin) && (!n.developer || isDeveloper)).map((n) => {
            const active = isActive(n.href);
            const count = n.href === "/compliance" ? complianceDeadlines.count : 0;
            if (count <= 0) {
              return <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={active ? "page" : undefined} style={linkStyle(active)}>{n.label}</Link>;
            }
            return (
              <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={active ? "page" : undefined} style={{ ...linkStyle(active), display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
          <CollapsibleNavGroup label="Vineyards" items={visibleVineyards} open={vineyardsOpen} setOpen={setVineyardsOpen} isActive={isActive} onNavigate={onNavigate} />
          <CollapsibleNavGroup label="Setup" items={visibleSetup} open={setupOpen} setOpen={setSetupOpen} isActive={isActive} onNavigate={onNavigate} />
        </>
      )}
      </nav>
      <div style={{ borderTop: "1px solid var(--border-strong)", padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {inboxEnabled ? (
            // Plan 068: the avatar becomes the "me" hub — a link into the inbox with a red unread badge.
            <Link
              href="/inbox"
              onClick={onNavigate}
              aria-label={unreadMessages > 0 ? `Inbox, ${unreadMessages} unread` : "Inbox"}
              style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}
            >
              <div style={{ position: "relative", flex: "none" }}>
                <Avatar name={user.name || user.email} size={34} />
                {unreadMessages > 0 ? (
                  <span
                    style={{
                      ...badgePill,
                      position: "absolute",
                      top: -5,
                      right: -6,
                      minWidth: 16,
                      height: 16,
                      fontSize: 10,
                      background: "var(--danger)",
                      color: "#fff",
                    }}
                  >
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                ) : null}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Inbox{unreadMessages > 0 ? ` · ${unreadMessages > 9 ? "9+" : unreadMessages} new` : ""}</div>
              </div>
            </Link>
          ) : (
            <>
              <Avatar name={user.name || user.email} size={34} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</div>
              </div>
            </>
          )}
        </div>
        <button onClick={onSignOut} style={{ marginTop: 8, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12.5, color: "var(--text-accent)", fontFamily: "var(--font-body)" }}>Sign out</button>
      </div>
    </>
  );
}

export function AppShell({
  user,
  children,
  pendingSamples = 0,
  pendingWorkOrders = 0,
  sparklingEnabled = false,
  customCrushEnabled = false,
  complianceDeadlines = { count: 0, urgent: false },
  voiceEnabled = false,
  inboxEnabled = false,
  unreadMessages = 0,
  diagnosticsTenantName = null,
}: {
  user: { name?: string | null; email: string; role?: string | null; supportOrganizationId?: string | null; supportOrganizationName?: string | null; supportExpiresAt?: string | null };
  children: React.ReactNode;
  pendingSamples?: number;
  pendingWorkOrders?: number;
  sparklingEnabled?: boolean;
  customCrushEnabled?: boolean;
  complianceDeadlines?: { count: number; urgent: boolean };
  voiceEnabled?: boolean;
  inboxEnabled?: boolean;
  unreadMessages?: number;
  /** Effective tenant name for the developer diagnostics indicator; null for non-developers. */
  diagnosticsTenantName?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = isTenantAdminLike(user);
  const isDeveloper = user.role === "developer";
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
    // Clear the captured console so the next user on a shared device can't inherit it (Plan 079 C-4).
    clearConsoleBuffer();
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
      {/* Skip link — must stay the FIRST focusable element in the document, or the
          keyboard user walks the whole sidebar before reaching the page (AC-S1, AC-F2).
          Hidden until focused; .skip-link is in globals.css. */}
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

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
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Open menu"
          aria-expanded={drawer}
          style={{
            minWidth: "var(--touch-min)", minHeight: "var(--touch-min)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
            cursor: "pointer", fontSize: 18, lineHeight: 1,
          }}
        >
          ☰
        </button>
      </header>

      {/* Desktop sidebar (hidden on mobile via .bw-desktop-sidebar) */}
      <aside className="bw-desktop-sidebar" style={{ ...sidebarBox, position: "sticky", top: 0, height: "100vh" }}>
        <SidebarContent user={user} isActive={isActive} isAdmin={isAdmin} isDeveloper={isDeveloper} wineryOpen={wineryOpen} setWineryOpen={setWineryOpen} vineyardsOpen={vineyardsOpen} setVineyardsOpen={setVineyardsOpen} setupOpen={setupOpen} setSetupOpen={setSetupOpen} onNavigate={() => {}} onSignOut={handleSignOut} pendingSamples={pendingSamples} pendingWorkOrders={pendingWorkOrders} sparklingEnabled={sparklingEnabled} customCrushEnabled={customCrushEnabled} complianceDeadlines={complianceDeadlines} inboxEnabled={inboxEnabled} unreadMessages={unreadMessages} />
      </aside>

      {/* Mobile drawer */}
      {drawer ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
          <div onClick={() => setDrawer(false)} style={{ position: "absolute", inset: 0, background: "rgba(20,19,15,0.45)" }} />
          <aside style={{ ...sidebarBox, display: "flex", position: "absolute", left: 0, top: 0, height: "100%", width: 264, boxShadow: "var(--shadow-xl)" }}>
            <button
              type="button"
              onClick={() => setDrawer(false)}
              aria-label="Close menu"
              style={{
                position: "absolute", right: 6, top: 6, zIndex: 1,
                width: "var(--touch-min)", height: "var(--touch-min)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-muted)",
              }}
            >
              ×
            </button>
            <SidebarContent user={user} isActive={isActive} isAdmin={isAdmin} isDeveloper={isDeveloper} wineryOpen={wineryOpen} setWineryOpen={setWineryOpen} vineyardsOpen={vineyardsOpen} setVineyardsOpen={setVineyardsOpen} setupOpen={setupOpen} setSetupOpen={setSetupOpen} onNavigate={() => setDrawer(false)} onSignOut={handleSignOut} pendingSamples={pendingSamples} pendingWorkOrders={pendingWorkOrders} sparklingEnabled={sparklingEnabled} customCrushEnabled={customCrushEnabled} complianceDeadlines={complianceDeadlines} inboxEnabled={inboxEnabled} unreadMessages={unreadMessages} />
          </aside>
        </div>
      ) : null}

      {/* Phase 3 (doc 01 §9): four labelled bottom tabs replace the drawer, whose
          trigger was 38x32px — the most important control on the phone, under the
          minimum target. `Find` carries the full destination directory so nothing
          becomes unreachable just because it left the four tabs. */}
      {NAV_V2_ENABLED ? (
        <MobileTabBar
          isActive={isActive}
          tabs={[
            { href: "/work-orders", label: "Work", glyph: "☑", badge: pendingWorkOrders },
            { href: "/bulk", label: "Cellar", glyph: "◍" },
            { href: "/vineyards/field-notes", label: "Vineyard", glyph: "❧" },
            { href: "/inbox", label: "Find", glyph: "⌕" },
          ]}
        />
      ) : null}

      <main id="main" tabIndex={-1} className="app-main" style={{ flex: 1, minWidth: 0, outline: "none" }}>
        {user.supportOrganizationId ? (
          <div
            role="status"
            style={{
              position: "sticky",
              top: 0,
              zIndex: 35,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-3)",
              padding: "10px 16px",
              background: "var(--accent)",
              color: "var(--accent-on)",
              fontFamily: "var(--font-body)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <span>
              Support view: {user.supportOrganizationName ?? user.supportOrganizationId}
              {user.supportExpiresAt ? <> expires <LocalTime value={user.supportExpiresAt} mode="time" /></> : ""}
            </span>
            <Button
              size="sm"
              variant="inverse"
              onClick={() => {
                void exitSupportTenant().then(() => router.refresh());
              }}
            >
              Exit support view
            </Button>
          </div>
        ) : null}
        {pathname.startsWith("/assistant") ? (
          // Full-bleed: the assistant is a workspace, not a document — use the width.
          <div className="px-4 py-4 md:px-6 md:py-6" style={{ height: "100%" }}>{children}</div>
        ) : (
          // Extra bottom padding reserves a "safe area" so the fixed assistant FAB (bottom-right,
          // var(--space-5) + 52px tall) never overlaps a page's bottom-anchored control (e.g. a
          // full-width "Create work order" submit). Inline paddingBottom overrides py-*'s bottom only.
          <div className="mx-auto px-4 py-5 md:px-10 md:py-8" style={{ maxWidth: "var(--container-xl)", paddingBottom: "calc(var(--space-5) * 2 + 52px)" }}>{children}</div>
        )}
      </main>

      {/* Global assistant dock — hides itself on /assistant (the full-page chat). Voice honors the same
          server gate as the full page; the dock force-closes any open voice session when it collapses. */}
      <AssistantDock userLabel={user.name || user.email} voiceEnabled={voiceEnabled} />
      {/* Diagnostics are developer-only and always on; never rendered for normal users. */}
      {isDeveloper && diagnosticsTenantName ? <DevDiagnostics tenantName={diagnosticsTenantName} /> : null}
    </div>
  );
}
