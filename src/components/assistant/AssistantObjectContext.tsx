"use client";

import React from "react";
import { usePathname } from "next/navigation";
import type { ObjectContextHint } from "@/lib/assistant/object-context";

// Lets a page tell the assistant which object it is showing, so the conversation continues on the
// SAME record after a navigation. Plan 105 U4 / DM-56.
//
// WHY A PROVIDER AND NOT A PROP: the hard constraint on Phase 9 is that AssistantDock.tsx is not
// edited (06-component-migration-map.md:34). The chat is the dock's child, so threading a prop down
// would mean editing it. A provider mounted ABOVE the dock in the (app) layout inverts that: any
// page can publish context without knowing the dock exists, and the dock file stays byte-unchanged.
//
// WHY A BRIDGE COMPONENT: `page.tsx` files here are SERVER components and cannot call a client
// setter. `<PageObjectContext />` is the smallest possible client leaf a server page can render to
// publish its object.
//
// STALENESS IS HANDLED DECLARATIVELY, NOT BY AN EFFECT: the published value carries the path it was
// published FROM, and the consumer ignores it unless that path is still the current one. The
// alternative — clear-on-unmount plus set-on-mount — depends on the order two effects fire during a
// route change, which is exactly the kind of thing that works until it doesn't. A persistent dock
// injecting the record the user already navigated away from is a correctness bug, not a nuisance.

type Published = (ObjectContextHint & { path: string }) | null;

type Ctx = { published: Published; publish: (next: Published) => void };

const AssistantObjectContextCtx = React.createContext<Ctx | null>(null);

export function AssistantObjectContextProvider({ children }: { children: React.ReactNode }) {
  const [published, setPublished] = React.useState<Published>(null);
  const publish = React.useCallback((next: Published) => setPublished(next), []);
  const value = React.useMemo(() => ({ published, publish }), [published, publish]);
  return <AssistantObjectContextCtx.Provider value={value}>{children}</AssistantObjectContextCtx.Provider>;
}

/**
 * The hint for the page the user is on RIGHT NOW, or null.
 *
 * Returns null when the published value came from a different route — see the staleness note above.
 * Also null when no provider is mounted, so the assistant works unchanged outside the (app) layout.
 */
export function useAssistantObjectContext(): ObjectContextHint | null {
  const ctx = React.useContext(AssistantObjectContextCtx);
  const pathname = usePathname();
  if (!ctx?.published) return null;
  const { path, ...hint } = ctx.published;
  return path === pathname ? hint : null;
}

/**
 * Rendered by a page to say "the user is looking at this". Renders nothing.
 *
 * A server page can render it directly:  <PageObjectContext entity="workOrder" id={wo.id} />
 */
export function PageObjectContext({ entity, id }: ObjectContextHint) {
  const ctx = React.useContext(AssistantObjectContextCtx);
  const pathname = usePathname();
  const publish = ctx?.publish;

  React.useEffect(() => {
    if (!publish) return;
    publish({ entity, id, path: pathname });
    // Clearing on unmount is belt-and-braces only: the path check in the consumer is what actually
    // guarantees a stale object is never injected.
    return () => publish(null);
  }, [publish, entity, id, pathname]);

  return null;
}

// ---------------------------------------------------------------------------
// Assistant availability (plan 105 U5 / DM-58)
//
// Same provider trick, same reason: the dock file must not be edited, so the value comes DOWN from
// the (app) layout rather than THROUGH AssistantDock's props. The layout resolves it from the one
// server-owned gate (lib/assistant/availability.ts) that /api/assistant also uses, so the composer
// and the route can never disagree about whether the assistant works.

const AssistantAvailabilityCtx = React.createContext<string | null>(null);

export function AssistantAvailabilityProvider({
  unavailableReason,
  children,
}: {
  unavailableReason: string | null;
  children: React.ReactNode;
}) {
  return (
    <AssistantAvailabilityCtx.Provider value={unavailableReason}>{children}</AssistantAvailabilityCtx.Provider>
  );
}

/** Why the assistant is off, or null when it is on. Null outside the (app) layout. */
export function useAssistantUnavailableReason(): string | null {
  return React.useContext(AssistantAvailabilityCtx);
}
