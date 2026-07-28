import React from "react";
import { SectionNav } from "@/components/ui";
import { NAV_V2_ENABLED } from "@/lib/nav/flag";
import { SECTIONS, sectionsFor } from "@/lib/nav/sections";
import { navContext } from "@/lib/nav/server-context";

/**
 * A hub's sub-navigation, rendered at the top of the hub's OWN page (plan 104 D1).
 *
 * ## Why this is not a layout.tsx
 * A `layout.tsx` is the idiomatic Next answer and it is wrong here: a layout wraps
 * every nested route, so `/work-orders/[id]/execute` would inherit the strip. That
 * screen is a focused capture surface a cellar hand uses with wet hands — sticky
 * action bar, single-column fields (doc 04 §130). Section tabs do not belong on it.
 * There are no hub layouts today, so nothing inherits the problem either.
 *
 * ## Why not in AppShell
 * `test/appshell-a11y.test.ts` asserts EXACTLY three `aria-current={` in the shell,
 * and a shell-level tab layer would need a client-side pathname → sections lookup.
 * Per-page means more call sites, each one line, each explicitly scoped to the hub
 * index rather than its children.
 *
 * Gated on the flag: with `NEXT_PUBLIC_NAV_V2` unset the legacy 31-entry sidebar is
 * live and every one of these routes is already in it, so the strip would be
 * duplicate chrome on a nav nobody is shipping yet. Production sees no change.
 *
 * Renders nothing when the hub has no visible sections for this user — a strip whose
 * only entry is "you are here" is noise.
 */
export async function HubSectionNav({
  hub,
  current,
}: {
  hub: keyof typeof SECTIONS | string;
  /**
   * The route being rendered. Defaults to the hub, which is right on the hub's own
   * index. **Section pages must pass their own href** — a strip that only appears on
   * the hub is a one-way door: click "Samples" and the strip you used vanishes.
   */
  current?: string;
}) {
  if (!NAV_V2_ENABLED) return null;
  const def = SECTIONS[hub];
  if (!def) return null;
  const items = sectionsFor(hub, await navContext());
  if (items.length === 0) return null;
  return <SectionNav items={items} current={current ?? hub} label={def.label} />;
}
