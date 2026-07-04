"use client";

// Phase 037: the tenant currency, pushed once from the server layout into a client context so every
// cost field renders ONE symbol without each component re-fetching settings. Pure-label only (no FX).
// Read it with useCurrency(): { code, symbol, format }. Outside a provider it falls back to USD so a
// stray render never throws.

import React from "react";
import { coerceCurrency, currencySymbol, formatMoney, DEFAULT_CURRENCY, type CurrencyCode } from "@/lib/money/currency";

type CurrencyContextValue = {
  code: CurrencyCode;
  /** The display prefix, e.g. "$" | "€" | "NZ$". */
  symbol: string;
  /** formatMoney bound to the tenant currency: format(1234.5) → "$1,234.50"; null/NaN → "—". */
  format: (amount: number | null | undefined, opts?: { per?: string }) => string;
};

const CurrencyContext = React.createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ code, children }: { code: string; children: React.ReactNode }) {
  const value = React.useMemo<CurrencyContextValue>(() => {
    const resolved = coerceCurrency(code);
    return {
      code: resolved,
      symbol: currencySymbol(resolved),
      format: (amount, opts) => formatMoney(amount, resolved, opts),
    };
  }, [code]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/** The tenant currency + bound helpers. Falls back to USD when no provider is mounted. */
export function useCurrency(): CurrencyContextValue {
  const ctx = React.useContext(CurrencyContext);
  if (ctx) return ctx;
  return {
    code: DEFAULT_CURRENCY,
    symbol: currencySymbol(DEFAULT_CURRENCY),
    format: (amount, opts) => formatMoney(amount, DEFAULT_CURRENCY, opts),
  };
}
