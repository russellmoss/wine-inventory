import type { CostComponent } from "@prisma/client";
import type { NormalizedAccount } from "@/lib/accounting/adapter";

// Phase 15 Unit 6 — the cost components the mapping UI surfaces, with plain-English labels/hints, plus
// the pure role→account ranking. PURE (no "server-only"): shared by the server CoA library, the client
// mapping card, and unit tests so the list, copy, and ranking never drift. Type-only Prisma import
// (erased at runtime), safe in the client bundle.

// Phase 16 adds the DTC (Commerce7) sales roles used by the Commerce7 mapping card.
export type AccountRole =
  | "cost"
  | "inventory"
  | "payable"
  | "revenue"
  | "salesTax"
  | "shipping"
  | "clearing"
  | "discount";

/** Which QBO AccountTypes best fit each role — used to RANK the picker, never to restrict it. */
const SUGGESTED_TYPES: Record<AccountRole, string[]> = {
  cost: ["Cost of Goods Sold", "Expense", "Other Expense"],
  inventory: ["Other Current Asset", "Fixed Asset", "Other Asset"],
  payable: ["Accounts Payable", "Other Current Liability", "Credit Card"],
  // Phase 16 DTC roles: a settled sale posts DR undeposited-funds clearing / CR revenue + CR
  // sales-tax-payable + CR shipping-income, with a discount contra line.
  revenue: ["Income", "Other Income"],
  salesTax: ["Other Current Liability", "Accounts Payable"],
  shipping: ["Income", "Other Income"],
  clearing: ["Other Current Asset", "Bank", "Other Current Liability"],
  discount: ["Income", "Expense", "Other Income"],
};

/** PURE: sort so the role's suggested account types come first, then by name. Never hides an account. */
export function rankAccountsForRole(accounts: NormalizedAccount[], role: AccountRole): NormalizedAccount[] {
  const pref = SUGGESTED_TYPES[role];
  const rank = (a: NormalizedAccount) => {
    const i = pref.indexOf(a.type);
    return i === -1 ? pref.length : i;
  };
  return [...accounts].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** PURE: a plain-English label for a cost component (for QuickBooks memos, reports). Falls back to the
 *  raw code for anything not in the list. */
export function componentLabel(component: CostComponent | string): string {
  return MAPPABLE_COMPONENTS.find((m) => m.component === component)?.label ?? String(component);
}

export const MAPPABLE_COMPONENTS: { component: CostComponent; label: string; hint: string }[] = [
  { component: "FRUIT", label: "Fruit / grapes", hint: "Harvest cost captured at crush." },
  { component: "MATERIAL", label: "Materials / additives", hint: "SO₂, nutrients, fining agents." },
  { component: "BARREL", label: "Barrel / cooperage", hint: "Cooperage amortization." },
  { component: "PACKAGING", label: "Packaging / dry goods", hint: "Glass, cork, capsule, label, case." },
  { component: "LABOR", label: "Labor", hint: "Recorded cost of cellar work." },
  { component: "OVERHEAD", label: "Overhead", hint: "Allocated facility / utility cost." },
  { component: "DOSAGE_LIQUEUR", label: "Dosage liqueur", hint: "Sparkling dosage addition." },
  { component: "VARIANCE", label: "Cost variance", hint: "Post-freeze true-ups (sold → COGS, unsold → inventory)." },
];
