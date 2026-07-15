import { rankMaterials } from "@/lib/inventory/material-search";
import type { VendorRow } from "@/lib/vendors/vendors-shared";

// Plan 069: fuzzy, search-as-you-type ranking for the vendor picker. Reuses the material-search engine
// (substring-wins + edit-distance + abbreviation floor) over the vendor's name + primary contact + email,
// so a typo ("scot labs") or a contact-name search still finds the vendor. Empty query → identity order
// (the caller's active-first / name-asc sort is preserved). Pure — no React, no DB.
export function rankVendors(query: string, vendors: readonly VendorRow[]): VendorRow[] {
  return rankMaterials(query, vendors, (v) => [v.name, v.contactName ?? "", v.email ?? ""]);
}
