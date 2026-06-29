import { describe, it, expect } from "vitest";
import { scopedVineyardWhere } from "@/lib/assistant/scope";
import type { AppUser } from "@/lib/access";

const base: AppUser = {
  id: "u1",
  name: "Test",
  email: "t@bhutanwine.com",
  role: "user",
  banned: false,
  mustChangePassword: false,
  vineyardIds: [],
};

describe("scopedVineyardWhere", () => {
  it("returns an unfiltered where for admins", () => {
    expect(scopedVineyardWhere({ ...base, role: "admin" })).toEqual({});
  });

  // PARITY: a single-vineyard manager scopes to exactly that one vineyard (via an IN of one).
  it("pins a single-vineyard manager to their vineyard", () => {
    expect(scopedVineyardWhere({ ...base, vineyardIds: ["v9"] })).toEqual({ id: { in: ["v9"] } });
  });

  it("scopes a multi-vineyard manager to their whole set", () => {
    expect(scopedVineyardWhere({ ...base, vineyardIds: ["v9", "v3"] })).toEqual({
      id: { in: ["v9", "v3"] },
    });
  });

  it("returns null for a manager with no vineyards", () => {
    expect(scopedVineyardWhere(base)).toBeNull();
  });
});
