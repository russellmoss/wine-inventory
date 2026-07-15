import { describe, it, expect } from "vitest";
import { orderedPair } from "@/lib/inbox/direct-messages";

describe("orderedPair", () => {
  const alice = { id: "aaa", email: "alice@demo.test" };
  const bob = { id: "bbb", email: "bob@demo.test" };

  it("sorts the pair so userAId < userBId", () => {
    const p = orderedPair(alice, bob);
    expect(p.userAId).toBe("aaa");
    expect(p.userBId).toBe("bbb");
    expect(p.userAEmail).toBe("alice@demo.test");
    expect(p.userBEmail).toBe("bob@demo.test");
  });

  it("is symmetric — argument order does not change the result (idempotent resolve key)", () => {
    expect(orderedPair(bob, alice)).toEqual(orderedPair(alice, bob));
  });

  it("keeps each email attached to its id after sorting", () => {
    const p = orderedPair(bob, alice);
    expect(p.userAId).toBe("aaa");
    expect(p.userAEmail).toBe("alice@demo.test");
  });
});
