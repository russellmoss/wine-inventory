"use client";

// The winery's OPERATING clock, pushed once from the server layout into a client context — the same
// shape as CurrencyProvider, and for the same reason: it's one tenant-wide display setting that a dozen
// unrelated components need, and threading it as a prop through every page guarantees one gets missed.
//
// `zone` is null when no winery timezone is configured, which is the meaningful default: readers then
// use the VIEWER's own browser zone, exactly as before the setting existed.

import React from "react";
import { browserTimeZone, resolveOperatingTimeZone } from "@/lib/work-orders/due-at";

type WineryTimeZoneValue = {
  /** The configured winery zone, or null when unset. */
  zone: string | null;
  /** Whether planned work is read on the winery's clock (true) or each viewer's own (false). */
  configured: boolean;
};

const WineryTimeZoneContext = React.createContext<WineryTimeZoneValue>({ zone: null, configured: false });

export function WineryTimeZoneProvider({ zone, children }: { zone: string | null; children: React.ReactNode }) {
  const value = React.useMemo<WineryTimeZoneValue>(() => ({ zone, configured: !!zone }), [zone]);
  return <WineryTimeZoneContext.Provider value={value}>{children}</WineryTimeZoneContext.Provider>;
}

/** The configured winery zone (null when unset). Safe outside a provider. */
export function useWineryTimeZone(): WineryTimeZoneValue {
  return React.useContext(WineryTimeZoneContext);
}

/**
 * The zone PLANNED work should be entered and displayed against: the winery's if set, else the viewer's.
 *
 * Returns `null` before mount when no winery zone is configured — the viewer's zone is a client-only
 * fact, so reading it during SSR would produce different HTML on the server and the client. Callers
 * render viewer-local content through `LocalTime` (which owns that hydration dance) in that case, and
 * format directly against the returned zone when there is one.
 */
export function useOperatingTimeZone(): string | null {
  const { zone } = useWineryTimeZone();
  const mounted = React.useSyncExternalStore(() => () => {}, () => true, () => false);
  if (zone) return resolveOperatingTimeZone(zone, null);
  return mounted ? browserTimeZone() : null;
}
