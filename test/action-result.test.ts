import { describe, it, expect } from "vitest";
import { settleAction, unwrap, type ActionResult } from "@/lib/action-result";
import { ActionError } from "@/lib/action-error";

// Regression for the WO-execute "An error occurred in the Server Components render" bug: a server
// action that THREW a user-safe ActionError had its message redacted by Next.js in production, so the
// client only saw the opaque render error. The fix routes such actions through settleAction (returns
// the message as data) + unwrap (re-throws it client-side). These lock that contract.

describe("settleAction", () => {
  it("wraps a success as { ok: true, data }", async () => {
    const r = await settleAction(async () => ({ taskId: "t1", status: "PENDING_APPROVAL" }));
    expect(r).toEqual({ ok: true, data: { taskId: "t1", status: "PENDING_APPROVAL" } });
  });

  it("settles an expected ActionError into { ok: false } with message + code (never thrown)", async () => {
    const r = await settleAction(async () => {
      throw new ActionError("Barrel B1 is empty — nothing to dose.", "CONFLICT");
    });
    expect(r).toEqual({ ok: false, error: "Barrel B1 is empty — nothing to dose.", code: "CONFLICT" });
  });

  it("defaults an ActionError with no explicit code to VALIDATION", async () => {
    const r = await settleAction(async () => {
      throw new ActionError("Enter an amount and a unit.");
    });
    expect(r).toEqual({ ok: false, error: "Enter an amount and a unit.", code: "VALIDATION" });
  });

  it("RETHROWS an unexpected (non-ActionError) error so it stays redacted + hits Sentry", async () => {
    await expect(
      settleAction(async () => {
        throw new TypeError("cannot read properties of undefined");
      }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});

describe("unwrap", () => {
  it("returns the payload on success", () => {
    expect(unwrap({ ok: true, data: 42 })).toBe(42);
  });

  it("re-throws the server's user-safe message as an ActionError on failure", () => {
    const failed: ActionResult<never> = { ok: false, error: "Barrel B1 is empty — nothing to dose.", code: "CONFLICT" };
    try {
      unwrap(failed);
      throw new Error("unwrap should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ActionError);
      expect((e as ActionError).message).toBe("Barrel B1 is empty — nothing to dose.");
      expect((e as ActionError).code).toBe("CONFLICT");
    }
  });

  it("round-trips a settled ActionError back to a throwing ActionError (server → client)", async () => {
    const settled = await settleAction(async () => {
      throw new ActionError("That task is already completed (awaiting review).", "CONFLICT");
    });
    expect(() => unwrap(settled)).toThrow("That task is already completed (awaiting review).");
  });
});
