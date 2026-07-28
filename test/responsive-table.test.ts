/**
 * ResponsiveTable, DataRow, and the shrink-to-zero migration of the global
 * mobile table rule (v2 §B14, §B15, doc 04 §4).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ui = (f: string) =>
  readFileSync(fileURLToPath(new URL(`../src/components/ui/${f}`, import.meta.url)), "utf8");

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const TABLE = ui("ResponsiveTable.tsx");
const ROW = ui("DataRow.tsx");
const GLOBALS = readFileSync(fileURLToPath(new URL("../src/app/globals.css", import.meta.url)), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (n.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const FILES = walk(SRC).map((p) => ({
  rel: p.slice(SRC.length + 1).split(sep).join("/"),
  text: readFileSync(p, "utf8"),
}));

describe("the global mobile table rule is being retired safely", () => {
  it("is scoped OFF tables that ResponsiveTable owns", () => {
    // This is the mechanism that makes a PARTIAL migration correct: a migrated
    // table opts itself out, so no table can ever have neither treatment.
    expect(GLOBALS).toContain(".app-main table:not([data-rt])");
  });

  it("has not been deleted while unmigrated tables still exist", () => {
    const unmigrated = FILES.filter((f) => /<table(?![^>]*data-rt)/.test(f.text));
    if (unmigrated.length > 0) {
      expect(
        GLOBALS,
        `${unmigrated.length} raw <table> remain — the legacy rule must stay until they migrate`,
      ).toContain("display: block");
    }
  });

  it("reports migration progress rather than hiding it", () => {
    const raw = FILES.filter((f) => /<table\b/.test(f.text));
    const migrated = FILES.filter((f) => /ResponsiveTable/.test(f.text) && !f.rel.startsWith("components/ui/"));
    // eslint-disable-next-line no-console
    console.log(
      `ResponsiveTable migration: ${migrated.length} file(s) migrated, ` +
        `${raw.length} file(s) still holding a raw <table>`,
    );
    expect(migrated.length).toBeGreaterThan(0);
  });
});

describe("ResponsiveTable (v2 §B15)", () => {
  it("keeps real table semantics — it never sets display:block itself", () => {
    expect(TABLE).toContain("<table");
    expect(TABLE).not.toContain('display: "block"');
  });

  it("names the scroll region and makes it keyboard-reachable", () => {
    // A scroll container only a mouse can pan is a WCAG 2.1.1 trap.
    expect(TABLE).toContain('role="region"');
    expect(TABLE).toContain("aria-labelledby={captionId}");
    expect(TABLE).toContain("tabIndex={0}");
  });

  it("requires a caption", () => {
    expect(TABLE).toMatch(/^\s*caption: string;/m);
  });

  it("stamps data-rt so the legacy rule can exclude it", () => {
    expect(TABLE).toContain("data-rt={transform}");
  });
});

describe("DataRow (v2 §B14)", () => {
  it("is a real <tr> with real <td>/<th>", () => {
    expect(ROW).toContain("<tr");
    expect(ROW).toContain("<td");
    expect(ROW).toContain("<th");
  });

  it("sets scope=col in the component so no call site can forget it", () => {
    expect(ROW).toContain('scope="col"');
  });

  it("uses the density tokens rather than hand-set heights", () => {
    expect(ROW).toContain("var(--row-h-comfortable)");
    expect(ROW).toContain("var(--row-h-default)");
    expect(ROW).toContain("var(--row-h-dense)");
    expect(ROW).toContain("var(--row-h-active)");
  });

  it("signals status with a left rule, not a background wash", () => {
    // A tinted row fails contrast against the text sitting on it.
    expect(ROW).toContain("var(--border-accent-width)");
  });

  it("never makes the whole row a link", () => {
    // A row-wide anchor makes every cell unselectable, which breaks copying a
    // lot code — something cellar staff do constantly.
    expect(ROW).not.toContain("<a ");
    expect(ROW).not.toContain("<Link");
  });

  it("uses tabular figures for numeric cells", () => {
    expect(ROW).toContain('fontVariantNumeric: numeric ? "tabular-nums" : undefined');
  });
});
