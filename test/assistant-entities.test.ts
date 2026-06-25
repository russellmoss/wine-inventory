import { describe, it, expect } from "vitest";
import { getEntity, allowedEntityNames } from "@/lib/assistant/entities";

describe("entity registry", () => {
  it("returns null for protected / unknown tables", () => {
    for (const name of ["AuditLog", "User", "Session", "Account", "Verification", "BottledInventory", "Nonsense"]) {
      expect(getEntity(name)).toBeNull();
    }
  });

  it("resolves an allowed entity (case-insensitive)", () => {
    expect(getEntity("VineyardBlock")?.name).toBe("VineyardBlock");
    expect(getEntity("vineyardblock")?.name).toBe("VineyardBlock");
  });

  it("never marks a protected table as allowed", () => {
    const names = allowedEntityNames();
    for (const protectedName of ["AuditLog", "User", "Session", "Account", "Verification"]) {
      expect(names).not.toContain(protectedName);
    }
  });
});
