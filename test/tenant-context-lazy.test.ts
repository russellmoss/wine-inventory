/**
 * TENANT-3 — the lazy-PrismaPromise tenant-scope trap, pinned at the helper.
 *
 * A Prisma model method returns a LAZY thenable: calling it BUILDS the query, and the tenant
 * extension's `$allOperations` hook (src/lib/prisma.ts) does not run until something calls `.then()`.
 * `AsyncLocalStorage.run` exits its scope the instant the callback RETURNS, so a callback that
 * returns a bare PrismaPromise would have the hook read the store from OUTSIDE the scope — throwing
 * with no ambient context, and silently using the OUTER tenant when one is live (cross-tenant).
 *
 * `runAsTenant` / `runWithTenantContext` therefore wrap the callback in `async () => await fn()`, so
 * the thenable is forced INSIDE the scope. These tests fail if that wrapper is ever removed.
 *
 * The fake below mimics a PrismaPromise exactly where it matters: it reads the tenant context at
 * `.then()` time, which is precisely what the extension hook does.
 */
import { describe, it, expect } from "vitest";
import { runAsTenant, runWithTenantContext, getTenantId, getContextUserId } from "@/lib/tenant/context";

/** A lazy thenable that records the tenant visible AT EVALUATION TIME (what the extension sees). */
function lazyQuery(label: string): PromiseLike<string> {
  return {
    then<A, B>(
      onFulfilled?: ((v: string) => A | PromiseLike<A>) | null,
      onRejected?: ((e: unknown) => B | PromiseLike<B>) | null,
    ) {
      const seen = getTenantId() ?? "<no-context>";
      return Promise.resolve(`${label}:${seen}`).then(onFulfilled, onRejected);
    },
  };
}

describe("TENANT-3 — runAsTenant forces lazy thenables inside the ALS scope", () => {
  it("a NON-async callback returning a bare lazy thenable still sees the tenant", async () => {
    const result = await runAsTenant("org_a", () => lazyQuery("bare") as Promise<string>);
    expect(result).toBe("bare:org_a");
  });

  it("the explicit `async () => await …` form works (the form call sites should use)", async () => {
    const result = await runAsTenant("org_a", async () => await lazyQuery("awaited"));
    expect(result).toBe("awaited:org_a");
  });

  it("an INNER explicit tenant wins over a live OUTER context — the cross-tenant shape", async () => {
    // This is the dangerous case: without the wrapper the inner query evaluates after the inner
    // scope exits, back under `org_outer`, silently reading/writing the wrong tenant's rows.
    const result = await runAsTenant("org_outer", async () =>
      runAsTenant("org_inner", () => lazyQuery("nested") as Promise<string>),
    );
    expect(result).toBe("nested:org_inner");
  });

  it("context survives an async continuation (a real query awaits I/O)", async () => {
    const result = await runAsTenant("org_a", async () => {
      await new Promise((r) => setTimeout(r, 1));
      return await lazyQuery("after-io");
    });
    expect(result).toBe("after-io:org_a");
  });

  it("Promise.all over several lazy thenables keeps the tenant", async () => {
    const result = await runAsTenant("org_a", () =>
      Promise.all([lazyQuery("q1"), lazyQuery("q2")]),
    );
    expect(result).toEqual(["q1:org_a", "q2:org_a"]);
  });

  it("the context does NOT leak past the scope", async () => {
    await runAsTenant("org_a", async () => await lazyQuery("x"));
    expect(getTenantId()).toBeUndefined();
  });

  it("a synchronous throw in the callback surfaces as a rejection, not a sync throw", async () => {
    // The async wrapper converts a sync throw into a rejection. Every caller awaits, and the
    // signature already promised Promise<T> — pinned so the change is deliberate, not accidental.
    await expect(
      runAsTenant("org_a", () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("an empty tenantId still fails closed, synchronously", () => {
    expect(() => runAsTenant("", async () => "nope")).toThrow(/non-empty tenantId/);
  });

  it("runWithTenantContext gets the same guarantee, and carries userId", async () => {
    const result = await runWithTenantContext({ tenantId: "org_a", userId: "user_1", skipWrap: true }, () => {
      const seen = getContextUserId();
      return Promise.resolve(seen);
    });
    expect(result).toBe("user_1");

    const lazy = await runWithTenantContext({ tenantId: "org_b" }, () => lazyQuery("wtc") as Promise<string>);
    expect(lazy).toBe("wtc:org_b");
  });
});
