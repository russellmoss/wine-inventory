// Canonical in-app route builder + section allowlist. The SINGLE source of
// truth for the URLs the assistant may link to or navigate to. The prompt's
// section list is generated from here (they can't drift), and every deep link
// is built here from a SERVER-RESOLVED id (never a model-supplied free-text id).
//
// Pure module: no prisma, no server-only. Entity existence / tenant + vineyard
// scope resolution happens in the navigate tool (see tools/navigate.ts) BEFORE
// an id ever reaches entityPath().

import { isSafeInternalPath } from "./assistant-events";

/** Entity kinds that have a real, linkable detail route in the app. */
export type RoutableEntity = "lot" | "workOrder" | "template" | "vineyard";

/**
 * Build the canonical path for a routable entity from an already-resolved id.
 * Every dynamic segment/param is encodeURIComponent'd (ids/names can contain
 * spaces, "/", unicode — an unescaped one crashes the router). Note the
 * `templateId` param name for templates (NOT `id`).
 */
export function entityPath(entity: RoutableEntity, id: string): string {
  const e = encodeURIComponent(id);
  switch (entity) {
    case "lot":
      return `/lots/${e}`;
    case "workOrder":
      return `/work-orders/${e}`;
    case "template":
      return `/work-orders/templates/${e}`;
    case "vineyard":
      // No /vineyards/[id] route exists; the harvest view accepts ?vineyard=.
      return `/vineyards/harvest?vineyard=${e}`;
    default: {
      const _exhaustive: never = entity;
      throw new Error(`Unknown routable entity: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Section (list/area) pages the assistant may link to. Label -> relative path.
 * Only paths confirmed to exist in src/app/(app)/. Every value is a safe
 * "/"-relative path (asserted by the test).
 */
export const SECTION_ROUTES: Record<string, string> = {
  dashboard: "/",
  "work orders": "/work-orders",
  "work-order templates": "/work-orders/templates",
  "tanks & barrels": "/vessels",
  harvest: "/vineyards/harvest",
  "field notes": "/vineyards/field-notes",
  "vineyard maps": "/vineyards/maps",
  fermentation: "/ferment",
  inventory: "/inventory",
  lots: "/lots",
  cellar: "/cellar",
  bottling: "/bottling",
  "bottled stock": "/bottled",
  "finished goods": "/finished-goods",
  locations: "/locations",
  reference: "/reference",
  reports: "/reports",
  samples: "/samples",
  compliance: "/compliance",
  accounting: "/accounting",
  settings: "/settings",
  "audit log": "/audit",
  assistant: "/assistant",
};

/** Resolve a section label to its path, or null if it isn't in the allowlist. */
export function sectionPath(label: string): string | null {
  const p = SECTION_ROUTES[label.trim().toLowerCase()];
  return p ?? null;
}

/** The bullet list of section routes for the system prompt (generated, not hand-kept). */
export function describeSectionsForPrompt(): string {
  return Object.entries(SECTION_ROUTES)
    .map(([label, path]) => `  - ${path} — ${label}`)
    .join("\n");
}

/** Guard used by tests + callers: every section path must be a safe internal path. */
export function allSectionPathsSafe(): boolean {
  return Object.values(SECTION_ROUTES).every((p) => p === "/" || isSafeInternalPath(p));
}
