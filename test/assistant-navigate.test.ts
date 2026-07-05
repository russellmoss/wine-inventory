import { describe, it, expect } from "vitest";
import { navigateTool } from "@/lib/assistant/tools/navigate";
import type { AppUser } from "@/lib/access";

// These exercise the DB-free branches: section resolution, the refusal shapes,
// and — most importantly — the SERVER-SIDE consent decision (auto-navigate only
// when the user's actual last message was an explicit "take me there"). The
// entity/vessel branches hit prisma and are covered by e2e/verify, not here.

const admin: AppUser = {
  id: "u1",
  name: "A",
  email: "a@demowinery.test",
  role: "admin",
  banned: false,
  mustChangePassword: false,
  vineyardIds: [],
  organizationIds: ["org_demo_winery"],
  activeOrganizationId: "org_demo_winery",
};

const ctx = (lastUserMessage: string) => ({ user: admin, lastUserMessage });

describe("navigate tool — section", () => {
  it("resolves a known section to a navigate payload", async () => {
    const out = (await navigateTool.run(ctx("take me to work orders"), { kind: "section", section: "work orders" })) as {
      navigate?: { path: string; auto: boolean };
    };
    expect(out.navigate?.path).toBe("/work-orders");
  });

  it("AUTO-navigates only on an explicit ask (consent is a server decision)", async () => {
    const explicit = (await navigateTool.run(ctx("take me to inventory"), { kind: "section", section: "inventory" })) as {
      navigate?: { auto: boolean };
    };
    expect(explicit.navigate?.auto).toBe(true);

    const incidental = (await navigateTool.run(ctx("how much sulfur is in inventory?"), {
      kind: "section",
      section: "inventory",
    })) as { navigate?: { auto: boolean } };
    expect(incidental.navigate?.auto).toBe(false); // no explicit nav verb -> link, don't yank
  });

  it("refuses an unknown section with the allowed list", async () => {
    const out = (await navigateTool.run(ctx("open the moon"), { kind: "section", section: "the moon" })) as {
      ok: boolean;
      reason: string;
      allowed: string[];
    };
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("unknown_section");
    expect(Array.isArray(out.allowed)).toBe(true);
  });
});

describe("navigate tool — guards", () => {
  it("returns bad_input when no target kind is given", async () => {
    const out = (await navigateTool.run(ctx("hi"), {})) as { ok: boolean; reason: string };
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("bad_input");
  });

  it("is a read tool (a UI action, never a mutation / confirm)", () => {
    expect(navigateTool.kind).toBe("read");
    expect(navigateTool.name).toBe("navigate");
  });
});
