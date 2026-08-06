// Phase 037: tenant currency — controlled vocabulary + pure, client-safe formatting. No prisma, no React.
// The tenant picks ONE currency (AppSettings.currency); this module maps it to a symbol and formats money.
// It is a LABEL layer only — no FX conversion. Every cost row already stamps its own `currency`.

export const SUPPORTED_CURRENCIES = ["USD", "EUR", "NZD", "AUD", "ZAR", "GBP"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  USD: "US Dollar (USD)",
  EUR: "Euro (EUR)",
  NZD: "New Zealand Dollar (NZD)",
  AUD: "Australian Dollar (AUD)",
  ZAR: "South African Rand (ZAR)",
  GBP: "British Pound (GBP)",
};

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  EUR: "€",
  NZD: "NZ$",
  AUD: "A$",
  ZAR: "R",
  GBP: "£",
};

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

/** Validate arbitrary input to a supported currency code; unknown/empty → USD (matches the schema default). */
export function coerceCurrency(raw: unknown): CurrencyCode {
  const up = String(raw ?? "").trim().toUpperCase();
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(up) ? (up as CurrencyCode) : DEFAULT_CURRENCY;
}

/**
 * STRICT parse — throws on an unsupported code instead of defaulting to USD.
 *
 * Use this anywhere the code participates in ARITHMETIC rather than in a label. `coerceCurrency`'s
 * forgiveness is right for a display symbol and wrong for money: silently mapping an OCR'd "CHF" to USD
 * books a foreign amount 1:1 at a fabricated rate, which is the exact failure
 * `ingest-invoice-core.ts` gates against by hand. That gate should not have to be re-hand-rolled at every
 * arithmetic site.
 */
export function requireCurrency(raw: unknown, what = "currency"): CurrencyCode {
  const up = String(raw ?? "").trim().toUpperCase();
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(up)) {
    throw new Error(
      `${what}: "${String(raw)}" is not a supported currency (${SUPPORTED_CURRENCIES.join(", ")}). ` +
        "Refusing to default it — a wrong currency on a money value books at a fabricated rate.",
    );
  }
  return up as CurrencyCode;
}

/** The display symbol/prefix for a currency (e.g. USD → "$", NZD → "NZ$"). Unknown coerces to the USD symbol. */
export function currencySymbol(code: string | null | undefined): string {
  return CURRENCY_SYMBOLS[coerceCurrency(code)];
}

/**
 * Format a money amount with the currency symbol prefix, 2 decimals, thousands separators
 * (e.g. formatMoney(1234.5, "NZD") → "NZ$1,234.50"). Null/undefined/non-finite → "—" (unknown, never $0).
 * Optional `perUnit` appends "/unit" (e.g. formatMoney(0.5,"USD",{per:"L"}) → "$0.50/L").
 */
export function formatMoney(amount: number | null | undefined, code: string | null | undefined, opts?: { per?: string }): string {
  const sym = currencySymbol(code);
  if (amount == null || !Number.isFinite(amount)) return "—";
  const n = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sym}${n}${opts?.per ? `/${opts.per}` : ""}`;
}
