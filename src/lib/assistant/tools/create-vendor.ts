import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal, signResume } from "../confirm";
import type { ChoiceRequest } from "../assistant-events";
import { createVendorAction } from "@/lib/vendors/actions";
import { findVendorsByName, getVendorNearMatchesCore } from "@/lib/vendors/vendors";
import type { VendorInput } from "@/lib/vendors/vendors-shared";

// Plan 069 (Unit 11): create a NEW vendor/supplier, wrapping createVendorCore via createVendorAction. Pure
// wrapper — no domain logic here. Dedups against existing vendors by name (refuses an exact duplicate so the
// vendor list doesn't fragment). Does NOT create a material (use create_material). Returns a preview to confirm.
// Plan 074: also catches NEAR-duplicates ("Scott Labs" vs "Scott Laboratories") and returns a CHOICE — use the
// existing vendor, or create a new one anyway (a deterministic resume token that re-runs with createAnyway).

type RawInput = {
  name?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  accountNumber?: string;
  poRequired?: boolean;
  terms?: string;
  url?: string;
  /** Internal: set by the "create anyway" near-duplicate picker option to skip the near-dup guard. */
  createAnyway?: boolean;
};

const s = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export const createVendorTool: AssistantTool = {
  name: "create_vendor",
  description:
    "Create a NEW vendor/supplier in the vendor list (the suppliers you buy expendables from, also used on " +
    "accounting bills). Use when the user wants to add a supplier — 'add a vendor called Scott Labs, Net 30', " +
    "'create a new vendor Gusmer, orders@gusmer.com, PO required'. Core field: name (required). Optional: phone, " +
    "email, primary contact name, our account number, PO-required flag, payment terms (e.g. 'Net 30', 'Pay at " +
    "purchase'), and website URL. This does NOT create a material/expendable — use create_material for that. " +
    "Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Vendor / supplier name, e.g. 'Scott Labs', 'Gusmer Enterprises'." },
      phone: { type: "string", description: "Optional phone number." },
      email: { type: "string", description: "Optional email address." },
      contactName: { type: "string", description: "Optional primary contact person's name." },
      accountNumber: { type: "string", description: "Optional — our account number with this vendor." },
      poRequired: { type: "boolean", description: "Optional — does this vendor require a purchase order?" },
      terms: { type: "string", description: "Optional payment terms, e.g. 'Net 30', 'Net 15', 'Pay at purchase'." },
      url: { type: "string", description: "Optional website or product URL." },
    },
    required: ["name"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    const name = s(input.name);
    if (!name) throw new Error("What's the vendor called?");
    // Dedup: refuse an EXACT duplicate, and surface NEAR-duplicates as a choice (unless the user already
    // chose "create anyway" via the picker). The whole point of managed vendors is one row per supplier.
    const tenantId = ctx.user.activeOrganizationId;
    if (tenantId) {
      // An EXACT duplicate is ALWAYS refused — even on the "create anyway" bypass, and case-insensitively
      // (the DB unique is case-sensitive, so this is the only guard against a case-variant dup).
      const existing = await findVendorsByName(tenantId, name);
      const exact = existing.find((v) => v.name.trim().toLowerCase() === name.toLowerCase());
      if (exact) throw new Error(`A vendor named "${exact.name}" already exists — no need to create it again.`);
    }
    if (tenantId && !input.createAnyway) {
      const { high } = await getVendorNearMatchesCore(name, { tenantId });
      if (high.length) {
        // Re-run this tool with the SAME input + createAnyway to skip the guard (deterministic, no model loop).
        const resumeAnyway = signResume("create_vendor", { ...input, name, createAnyway: true });
        const choice: ChoiceRequest = {
          needsChoice: true,
          prompt: `You already have a vendor that looks like “${name}”. Use the existing one, or create a new vendor?`,
          options: [
            ...high.map((v) => ({
              label: `Use existing “${v.name}”`,
              send: `That's the same supplier — use the existing vendor “${v.name}”, don't create a duplicate.`,
            })),
            { label: `Create “${name}” as a new, separate vendor`, resume: resumeAnyway },
          ],
        };
        return choice;
      }
    }
    const bits = [s(input.terms) && `terms ${s(input.terms)}`, s(input.email), s(input.phone)].filter(Boolean);
    const preview = `Add vendor "${name}"${bits.length ? ` (${bits.join(", ")})` : ""} to the vendor list.`;
    const token = signProposal("create_vendor", {
      name,
      ...(s(input.phone) ? { phone: s(input.phone) } : {}),
      ...(s(input.email) ? { email: s(input.email) } : {}),
      ...(s(input.contactName) ? { contactName: s(input.contactName) } : {}),
      ...(s(input.accountNumber) ? { accountNumber: s(input.accountNumber) } : {}),
      ...(input.poRequired != null ? { poRequired: !!input.poRequired } : {}),
      ...(s(input.terms) ? { terms: s(input.terms) } : {}),
      ...(s(input.url) ? { url: s(input.url) } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitCreateVendor: Committer = async (_user, args) => {
  const input: VendorInput = {
    name: String(args.name),
    phone: args.phone == null ? undefined : String(args.phone),
    email: args.email == null ? undefined : String(args.email),
    contactName: args.contactName == null ? undefined : String(args.contactName),
    accountNumber: args.accountNumber == null ? undefined : String(args.accountNumber),
    poRequired: args.poRequired == null ? undefined : Boolean(args.poRequired),
    terms: args.terms == null ? undefined : String(args.terms),
    url: args.url == null ? undefined : String(args.url),
  };
  await createVendorAction(input);
  return { message: `Added vendor "${input.name}".`, navigate: { path: "/setup/vendors", label: "View vendors" } };
};
