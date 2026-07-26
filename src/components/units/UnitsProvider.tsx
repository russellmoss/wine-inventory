"use client";

// Plan 098 — the tenant's RESOLVED display-unit preferences, pushed once from the server layout into
// a client context. Same shape and same reason as CurrencyProvider / WineryTimeZoneProvider: one
// tenant-wide display setting that dozens of unrelated components need, and threading it as a prop
// through every page guarantees one gets missed.
//
// The value is always fully resolved (every dimension non-null) — an unconfigured tenant reads as
// metric, which is exactly the pre-feature behavior. The default context value is metric too, so a
// component rendered outside the provider (tests, isolated stories) behaves like an unconfigured
// tenant instead of crashing.

import React from "react";
import { DEFAULT_METRIC_PREFS, type UnitPrefs } from "@/lib/units/display";

const UnitsContext = React.createContext<UnitPrefs>(DEFAULT_METRIC_PREFS);

export function UnitsProvider({ prefs, children }: { prefs: UnitPrefs; children: React.ReactNode }) {
  return <UnitsContext.Provider value={prefs}>{children}</UnitsContext.Provider>;
}

/** The tenant's resolved display-unit preferences. Safe outside a provider (resolves metric). */
export function useUnitPrefs(): UnitPrefs {
  return React.useContext(UnitsContext);
}
