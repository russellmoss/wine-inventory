import "server-only";
import type { AssistantTool } from "../registry";
import { listVendors } from "@/lib/vendors/vendors";
import { rankVendors } from "@/lib/inventory/vendor-search";
import { findDuplicateVendorGroups } from "@/lib/vendors/vendors-shared";

// Plan 069 (Unit 11): read the vendor/supplier list. Wraps listVendors (tenant-scoped via RLS + the Prisma
// extension). The READ counterpart to create_vendor. Answers "what vendors do we have", "who do we buy X
// from", "show Scott Labs' contact info / terms", "what's our account number with Gusmer".

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export const queryVendorsTool: AssistantTool = {
  name: "query_vendors",
  description:
    "Read the vendor/supplier list. Use for 'what vendors do we have', 'who do we buy bentonite from', " +
    "'show Scott Labs' phone/email', 'what are our terms with Gusmer', 'what's our account number with X'. " +
    "Returns each vendor's contact info, payment terms, PO-required flag, website, and additional contacts, " +
    "plus a `possibleDuplicates` list flagging vendors that look like the same supplier under two spellings " +
    "(e.g. 'Scott Labs' vs 'Scott Laboratories'). Read-only — to add a vendor use create_vendor, to combine " +
    "duplicates use merge_vendors.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      search: { type: "string", description: "Optional free-text name/contact/email to filter (fuzzy). E.g. 'Scott', 'Gusmer'." },
      includeInactive: { type: "boolean", description: "Include archived vendors. Defaults false (active only)." },
      limit: { type: "number", description: `Maximum vendors to return (default ${DEFAULT_LIMIT}, capped at ${MAX_LIMIT}).` },
    },
  },
  async run(_ctx, rawInput) {
    const r = (rawInput ?? {}) as Record<string, unknown>;
    const includeInactive = r.includeInactive === true;
    const search = str(r.search);
    const limitRaw = typeof r.limit === "number" ? r.limit : undefined;
    const limit = limitRaw && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT;

    const all = await listVendors({ activeOnly: !includeInactive });
    const filtered = search ? rankVendors(search, all) : all;
    const totalMatched = filtered.length;
    const vendors = filtered.slice(0, limit).map((v) => ({
      id: v.id,
      name: v.name,
      phone: v.phone,
      email: v.email,
      contactName: v.contactName,
      accountNumber: v.accountNumber,
      poRequired: v.poRequired,
      terms: v.terms,
      url: v.url,
      isActive: v.isActive,
      contacts: v.contacts.map((c) => ({ name: c.name, role: c.role, phone: c.phone, mobile: c.mobile, email: c.email, isPrimary: c.isPrimary })),
    }));

    // Duplicate hint over the FULL active list (not just the filtered slice) so it's stable regardless of search.
    const possibleDuplicates = findDuplicateVendorGroups(all.filter((v) => v.isActive)).map((g) => ({
      names: g.map((v) => v.name),
      ids: g.map((v) => v.id),
    }));

    return { count: vendors.length, totalMatched, truncated: totalMatched > vendors.length, vendors, possibleDuplicates };
  },
};
