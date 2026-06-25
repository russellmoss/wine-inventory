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
  assignedVineyardId: null,
};

describe("scopedVineyardWhere", () => {
  it("returns an unfiltered where for admins", () => {
    expect(scopedVineyardWhere({ ...base, role: "admin" })).toEqual({});
  });

  it("pins a manager to their assigned vineyard", () => {
    expect(scopedVineyardWhere({ ...base, assignedVineyardId: "v9" })).toEqual({ id: "v9" });
  });

  it("returns null for a manager with no vineyard assigned", () => {
    expect(scopedVineyardWhere(base)).toBeNull();
  });
});
