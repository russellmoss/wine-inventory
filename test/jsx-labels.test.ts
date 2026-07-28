/**
 * Correctness of the unlabelled-control detector.
 *
 * This test is the whole point of the module. Three ad-hoc greps produced three
 * different counts of unlabelled selects in this repo (31, 71, 34) and the best
 * of them still had a false positive. Every failure traced to one assumption:
 * that a JSX opening tag ends at the next `>`. It does not — `>` appears in
 * `(e) => …`, in `a > b`, and inside strings and template literals.
 *
 * So each fixture below is a shape that actually broke a previous attempt.
 */
import { describe, expect, it } from "vitest";
import {
  attr,
  findUnlabelledControls,
  htmlForTargets,
  insideLabel,
  isInsideComment,
  normaliseId,
  openingTag,
} from "../scripts/lib/jsx-labels";

const at = (src: string) => openingTag(src, src.indexOf("<select"));

describe("openingTag — finding the real end of a JSX tag", () => {
  it("handles the simple case", () => {
    expect(at(`<select id="a">`)).toBe(`<select id="a">`);
  });

  it("does NOT stop at the > inside an arrow function", () => {
    // This is the bug that produced the 71-count. `(e) =>` ends the tag early,
    // so aria-label further along was never seen.
    const src = `<select onChange={(e) => setX(e.target.value)} aria-label="Variety">`;
    expect(at(src)).toContain('aria-label="Variety"');
  });

  it("does not stop at a > inside a string attribute", () => {
    const src = `<select placeholder="a > b" aria-label="Named">`;
    expect(at(src)).toContain('aria-label="Named"');
  });

  it("does not stop at a > inside a template literal", () => {
    const src = "<select id={`row-${i}>x`} aria-label=\"Named\">";
    expect(at(src)).toContain('aria-label="Named"');
  });

  it("handles nested braces in a template expression", () => {
    const src = "<select id={`k-${JSON.stringify({ a: 1 })}`} aria-label=\"Named\">";
    expect(at(src)).toContain('aria-label="Named"');
  });

  it("handles a nested object literal in style", () => {
    const src = `<select style={{ height: 44, border: "1px solid red" }} aria-label="Named">`;
    expect(at(src)).toContain('aria-label="Named"');
  });

  it("handles a self-closing control", () => {
    const src = `<input type="text" aria-label="Named" />`;
    expect(openingTag(src, 0)).toBe(src);
  });

  it("returns null when the tag never closes", () => {
    expect(openingTag(`<select onChange={(e) => {`, 0)).toBeNull();
  });
});

describe("attr", () => {
  it("reads double, single, template and expression values", () => {
    expect(attr(`<select aria-label="A">`, "aria-label")).toBe("A");
    expect(attr(`<select aria-label='B'>`, "aria-label")).toBe("B");
    expect(attr("<select id={`t-${i}`}>", "id")).toBe("t-${i}");
    expect(attr(`<select id={someId}>`, "id")).toBe("someId");
  });

  it("returns null for an absent attribute", () => {
    expect(attr(`<select>`, "aria-label")).toBeNull();
  });

  it("does not confuse a prefix (aria-labelledby is not aria-label)", () => {
    // `\baria-label=` must not match inside `aria-labelledby=`.
    expect(attr(`<select aria-labelledby="x">`, "aria-label")).toBeNull();
  });
});

describe("normaliseId + htmlForTargets — template-literal ids", () => {
  it("collapses interpolations so a loop's label and control match", () => {
    expect(normaliseId("sf-m${i}-role")).toBe("sf-m${}-role");
    expect(normaliseId("sf-m${idx}-role")).toBe("sf-m${}-role");
  });

  it("collects htmlFor values in every quoting style", () => {
    const src = 'a<label htmlFor="x"/> <label htmlFor={`y-${i}`}/> <label htmlFor={z}/>';
    const t = htmlForTargets(src);
    expect(t.has("x")).toBe(true);
    expect(t.has("y-${}")).toBe(true);
    expect(t.has("z")).toBe(true);
  });
});

describe("insideLabel", () => {
  it("detects a still-open wrapping label", () => {
    expect(insideLabel(`<label>Variety `)).toBe(true);
  });
  it("is false once the label closed", () => {
    expect(insideLabel(`<label>Variety</label> `)).toBe(false);
  });
});

describe("isInsideComment", () => {
  it("spots a line comment", () => {
    const src = `// replaces a flat <select>\n<select aria-label="x">`;
    expect(isInsideComment(src, src.indexOf("<select"))).toBe(true);
  });
  it("spots a block comment", () => {
    const src = `/* the old <select> */\n<select aria-label="x">`;
    expect(isInsideComment(src, src.indexOf("<select"))).toBe(true);
  });
  it("does not flag real code", () => {
    const src = `const a = "x";\n<select aria-label="x">`;
    expect(isInsideComment(src, src.indexOf("<select"))).toBe(false);
  });
});

describe("findUnlabelledControls", () => {
  const find = (src: string) => findUnlabelledControls(src, "f.tsx", ["select"]);

  it("flags a select with no name at all", () => {
    expect(find(`<select value={v} onChange={(e) => set(e)}>`)).toHaveLength(1);
  });

  it("accepts aria-label", () => {
    expect(find(`<select aria-label="Variety">`)).toHaveLength(0);
  });

  it("rejects an EMPTY aria-label", () => {
    // An empty name is the same as no name, and it is a common copy-paste stub.
    expect(find(`<select aria-label="">`)).toHaveLength(1);
  });

  it("accepts aria-labelledby", () => {
    expect(find(`<select aria-labelledby="h1">`)).toHaveLength(0);
  });

  it("accepts an id that a htmlFor points at", () => {
    expect(find(`<label htmlFor="v">Variety</label><select id="v">`)).toHaveLength(0);
  });

  it("accepts a template-literal id matched by a template-literal htmlFor", () => {
    const src = "<label htmlFor={`sf-m${i}-role`}>Role</label><select id={`sf-m${i}-role`}>";
    expect(find(src)).toHaveLength(0);
  });

  it("flags an id that NOTHING points at", () => {
    expect(find(`<select id="orphan">`)).toHaveLength(1);
  });

  it("accepts a wrapping label", () => {
    expect(find(`<label>Variety <select value={v}></select></label>`)).toHaveLength(0);
  });

  it("ignores a mention inside a comment", () => {
    expect(find(`// Phase 034: replaces a flat <select>.\nconst x = 1;`)).toHaveLength(0);
  });

  it("does NOT accept title as an accessible name", () => {
    // The design system forbids meaning-in-a-tooltip: unreachable on touch.
    expect(find(`<select title="Variety">`)).toHaveLength(1);
  });

  it("reports the right line number", () => {
    const src = `line1\nline2\n<select value={v}>`;
    expect(find(src)[0].line).toBe(3);
  });

  it("skips input type=hidden", () => {
    const src = `<input type="hidden" name="k" value="1" />`;
    expect(findUnlabelledControls(src, "f.tsx", ["input"])).toHaveLength(0);
  });

  it("finds multiple controls in one file", () => {
    const src = `<select value={a} onChange={(e) => f(e)}>\n<select value={b} aria-label="B">\n<select value={c}>`;
    expect(find(src)).toHaveLength(2);
  });
});

describe("regression: the exact shapes that broke the earlier greps", () => {
  it("WeatherCard — arrow fn with a template literal, then aria-label", () => {
    // The false positive in attempt #3.
    const src = [
      "<select",
      '  value={selectedId ?? ""}',
      "  onChange={(e) => startTransition(() => router.push(`/w?v=${e.target.value}`))}",
      '  style={{ padding: "8px 10px" }}',
      '  aria-label="Vineyard"',
      ">",
    ].join("\n");
    expect(findUnlabelledControls(src, "WeatherCard.tsx", ["select"])).toHaveLength(0);
  });

  it("MaterialFilterPicker — a comment mentioning <select>", () => {
    const src = "// Phase 034: single-select material picker. Replaces a flat <select>\nexport function P() {}";
    expect(findUnlabelledControls(src, "P.tsx", ["select"])).toHaveLength(0);
  });

  it("SprayForm — loop-generated id paired with a loop-generated htmlFor", () => {
    const src = [
      "{items.map((m, i) => (",
      "  <div key={i}>",
      "    <label htmlFor={`sf-m${i}-role`}>Role</label>",
      "    <select id={`sf-m${i}-role`} value={m.role} onChange={(e) => set(i, e.target.value)}>",
      "    </select>",
      "  </div>",
      "))}",
    ].join("\n");
    expect(findUnlabelledControls(src, "SprayForm.tsx", ["select"])).toHaveLength(0);
  });

  it("PressClient — a VISIBLE but unassociated label is still a failure", () => {
    // The label renders; assistive tech gets nothing. This must be flagged.
    const src = `<label style={label}>Lot to press</label>\n<select value={posKey} onChange={(e) => setPosKey(e.target.value)}>`;
    expect(findUnlabelledControls(src, "PressClient.tsx", ["select"])).toHaveLength(1);
  });
});
