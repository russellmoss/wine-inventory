import { describe, expect, it } from "vitest";
import {
  buildDeveloperWorkspaceHref,
  parseDeveloperWorkspaceQuery,
  shouldLoadActiveDeveloperTenant,
  withActiveDeveloperTenant,
} from "@/lib/developer/workspace-query";

describe("developer workspace query", () => {
  it("keeps an exact deep-linked tenant available outside the bounded directory page", () => {
    const loaded = [{ id: "org_alpha", name: "Alpha" }];
    const active = { id: "org_zulu", name: "Zulu" };
    expect(withActiveDeveloperTenant(loaded, active)).toEqual([active, ...loaded]);
    expect(withActiveDeveloperTenant(loaded, loaded[0])).toBe(loaded);
  });

  it("never injects a default-mode exact tenant into Automation", () => {
    expect(
      shouldLoadActiveDeveloperTenant({ tenantId: "org_zulu", view: "automation" }),
    ).toBe(false);
    expect(shouldLoadActiveDeveloperTenant({ tenantId: "org_zulu", view: "inbox" })).toBe(
      true,
    );
  });
  it("defaults to Inbox and accepts the shareable filter/deep-link contract", () => {
    expect(
      parseDeveloperWorkspaceQuery({
        view: "tracked",
        tenantId: "org_demo_winery",
        q: "  barrel sync  ",
        severity: "P1",
        disposition: "PRODUCT_GAP",
        source: "FEEDBACK_TICKET",
        item: "ticket_42",
        assistantCursor: "abc_123",
        ticketCursor: "def-456",
      }),
    ).toEqual({
      view: "tracked",
      queue: "TRACKED",
      tenantId: "org_demo_winery",
      q: "barrel sync",
      severity: "P1",
      disposition: "PRODUCT_GAP",
      source: "FEEDBACK_TICKET",
      item: "ticket_42",
      assistantCursor: "abc_123",
      ticketCursor: "def-456",
      invalid: [],
    });
    expect(parseDeveloperWorkspaceQuery({}).view).toBe("inbox");
    expect(parseDeveloperWorkspaceQuery({}).queue).toBe("INBOX");
  });

  it("fails malformed enum, identifier, cursor, and partial deep-link state closed", () => {
    const parsed = parseDeveloperWorkspaceQuery({
      view: "made-up",
      tenantId: "../other-tenant",
      q: "x".repeat(121),
      severity: "critical",
      disposition: "SOMETHING_ELSE",
      source: "FEEDBACK_TICKET",
      item: "ticket_42",
      assistantCursor: "not base64!",
    });
    expect(parsed).toMatchObject({
      view: "inbox",
      queue: "INBOX",
      tenantId: null,
      q: "",
      severity: null,
      disposition: null,
      source: null,
      item: null,
      assistantCursor: null,
      ticketCursor: null,
    });
    expect(parsed.invalid).toEqual([
      "view",
      "tenantId",
      "q",
      "severity",
      "disposition",
      "assistantCursor",
      "deepLink",
    ]);
  });

  it("builds canonical URLs, clearing cursors and selection when filters change", () => {
    const parsed = parseDeveloperWorkspaceQuery({
      view: "ready",
      tenantId: "org_demo_winery",
      q: "sync",
      source: "FEEDBACK_TICKET",
      item: "ticket_42",
      assistantCursor: "abc_123",
      ticketCursor: "def-456",
    });
    expect(
      buildDeveloperWorkspaceHref(parsed, {
        view: "closed",
        q: "bottling",
        source: null,
        item: null,
        assistantCursor: null,
        ticketCursor: null,
      }),
    ).toBe("/developer?view=closed&tenantId=org_demo_winery&q=bottling");
  });

  it("keeps exact source/item links opaque and stable", () => {
    const parsed = parseDeveloperWorkspaceQuery({ view: "inbox" });
    expect(
      buildDeveloperWorkspaceHref(parsed, {
        tenantId: "org_demo_winery",
        source: "ASSISTANT_FEEDBACK",
        item: "feedback_123",
      }),
    ).toBe(
      "/developer?view=inbox&tenantId=org_demo_winery&source=ASSISTANT_FEEDBACK&item=feedback_123",
    );
  });
});
