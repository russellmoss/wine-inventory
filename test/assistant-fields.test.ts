import { describe, it, expect } from "vitest";
import { validateFields, type FieldSpec } from "@/lib/assistant/fields";

const specs: FieldSpec[] = [
  { name: "blockLabel", type: "string", min: 1, max: 80 },
  { name: "vineCount", type: "int", min: 0 },
  { name: "irrigated", type: "boolean" },
  { name: "kind", type: "enum", enumValues: ["A", "B"] },
];

describe("validateFields", () => {
  it("coerces and accepts valid values (update mode)", () => {
    expect(validateFields(specs, { vineCount: "200", irrigated: "yes" }, "update")).toEqual({
      vineCount: 200,
      irrigated: true,
    });
  });

  it("rejects unknown fields", () => {
    expect(() => validateFields(specs, { bogus: 1 }, "update")).toThrow(/Unknown field "bogus"/);
  });

  it("rejects a non-integer int and out-of-range", () => {
    expect(() => validateFields(specs, { vineCount: "1.5" }, "update")).toThrow(/whole number/);
    expect(() => validateFields(specs, { vineCount: "-3" }, "update")).toThrow(/≥ 0/);
  });

  it("enforces enum membership", () => {
    expect(() => validateFields(specs, { kind: "Z" }, "update")).toThrow(/one of: A, B/);
    expect(validateFields(specs, { kind: "A" }, "update")).toEqual({ kind: "A" });
  });

  it("update mode requires at least one field", () => {
    expect(() => validateFields(specs, {}, "update")).toThrow(/at least one field/);
  });

  it("create mode enforces required fields", () => {
    const req: FieldSpec[] = [{ name: "vineyard", type: "string", required: true }, { name: "blockLabel", type: "string" }];
    expect(() => validateFields(req, { blockLabel: "B6" }, "create")).toThrow(/"vineyard" is required/);
    expect(validateFields(req, { vineyard: "Bajo", blockLabel: "B6" }, "create")).toEqual({ vineyard: "Bajo", blockLabel: "B6" });
  });
});
