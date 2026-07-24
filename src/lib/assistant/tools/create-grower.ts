import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal, signResume } from "../confirm";
import type { ChoiceRequest } from "../assistant-events";
import { createGrowerAction } from "@/lib/grower/actions";
import { findGrowersByName, getGrowerNearMatchesCore } from "@/lib/grower/data";
import type { CreateGrowerInput } from "@/lib/grower/grower-core";

// Plan 095: create a NEW grower (the farm / party that GROWS and SELLS the fruit), wrapping createGrowerCore
// via createGrowerAction. Mirrors create_vendor. A third-party grower is also linked + pushed to QBO as a
// vendor (the winery pays growers like vendors); an ESTATE grower — the winery's OWN vineyard — is not.
// Distinct from create_vendor (a SUPPLIER you buy consumables from) and from the wine's OWNER (change_ownership).
// Dedups against existing growers by name (refuses an exact dup; surfaces near-dups as a choice). Returns a
// preview to confirm. Additional contacts are managed in Setup → Growers, not through this tool (scalar-only,
// like create_vendor).

type RawInput = {
  name?: string;
  company?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  isEstate?: boolean;
  /** Internal: set by the "create anyway" near-duplicate picker option to skip the near-dup guard. */
  createAnyway?: boolean;
};

const s = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export const createGrowerTool: AssistantTool = {
  name: "create_grower",
  description:
    "Create a NEW grower — the farm or party that GROWS and SELLS the winery the fruit (e.g. 'add a grower " +
    "called Bien Nacido Vineyard, contact Nick, 805-555-1000'). A third-party grower is paid like a vendor, so " +
    "creating one also sets them up as a vendor (incl. QuickBooks) automatically. Use isEstate:true only for the " +
    "winery's OWN vineyard (estate fruit) — that one is NOT set up as a vendor. Core field: name (required). " +
    "Optional: company/legal name, primary contact name, phone, email, address. This is NOT a supplier you buy " +
    "consumables from (use create_vendor) and NOT the OWNER of the wine (that's change_ownership). Additional " +
    "contacts are added later in Setup. Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Grower / farm name, e.g. 'Bien Nacido Vineyard', 'Sunny Slope Ranch'." },
      company: { type: "string", description: "Optional legal entity name, if different from the display name." },
      contactName: { type: "string", description: "Optional primary contact person's name." },
      phone: { type: "string", description: "Optional phone number." },
      email: { type: "string", description: "Optional email address." },
      address: { type: "string", description: "Optional mailing / vineyard address." },
      isEstate: { type: "boolean", description: "Optional — true ONLY for the winery's own vineyard (estate fruit); estate growers are not set up as vendors." },
    },
    required: ["name"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    const name = s(input.name);
    if (!name) throw new Error("What's the grower called?");
    // Dedup: refuse an EXACT duplicate, and surface NEAR-duplicates as a choice (unless the user already
    // chose "create anyway"). One grower row per farm keeps intake/compliance attribution clean.
    const tenantId = ctx.user.activeOrganizationId;
    if (tenantId) {
      const existing = await findGrowersByName(tenantId, name);
      const exact = existing.find((g) => g.name.trim().toLowerCase() === name.toLowerCase());
      if (exact) throw new Error(`A grower named "${exact.name}" already exists — no need to create it again.`);
    }
    if (tenantId && !input.createAnyway) {
      const { high } = await getGrowerNearMatchesCore(name, { tenantId });
      if (high.length) {
        const resumeAnyway = signResume("create_grower", { ...input, name, createAnyway: true });
        const choice: ChoiceRequest = {
          needsChoice: true,
          prompt: `You already have a grower that looks like “${name}”. Use the existing one, or create a new grower?`,
          options: [
            ...high.map((g) => ({
              label: `Use existing “${g.name}”`,
              send: `That's the same grower — use the existing “${g.name}”, don't create a duplicate.`,
            })),
            { label: `Create “${name}” as a new, separate grower`, resume: resumeAnyway },
          ],
        };
        return choice;
      }
    }
    const bits = [s(input.contactName), s(input.phone), s(input.email), input.isEstate ? "estate" : undefined].filter(Boolean);
    const vendorNote = input.isEstate ? "" : " (also set up as a vendor)";
    const preview = `Add grower "${name}"${bits.length ? ` (${bits.join(", ")})` : ""}${vendorNote}.`;
    const token = signProposal("create_grower", {
      name,
      ...(s(input.company) ? { company: s(input.company) } : {}),
      ...(s(input.contactName) ? { contactName: s(input.contactName) } : {}),
      ...(s(input.phone) ? { phone: s(input.phone) } : {}),
      ...(s(input.email) ? { email: s(input.email) } : {}),
      ...(s(input.address) ? { address: s(input.address) } : {}),
      ...(input.isEstate != null ? { isEstate: !!input.isEstate } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitCreateGrower: Committer = async (_user, args) => {
  const input: CreateGrowerInput = {
    name: String(args.name),
    company: args.company == null ? undefined : String(args.company),
    contactName: args.contactName == null ? undefined : String(args.contactName),
    phone: args.phone == null ? undefined : String(args.phone),
    email: args.email == null ? undefined : String(args.email),
    address: args.address == null ? undefined : String(args.address),
    isEstate: args.isEstate == null ? undefined : Boolean(args.isEstate),
  };
  const res = await createGrowerAction(input);
  if (!res.ok) throw new Error(res.error);
  const suffix = res.grower.isEstate ? "" : res.grower.vendorId ? " (also added as a vendor)" : "";
  return { message: `Added grower "${input.name}"${suffix}.`, navigate: { path: "/setup/growers", label: "View growers" } };
};
