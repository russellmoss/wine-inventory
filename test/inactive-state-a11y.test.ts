/**
 * State is never signalled by dimming text.
 *
 * The app used `opacity: 0.5–0.6` on rows and cards to mean archived / inactive /
 * disabled. Opacity composites the TEXT against the background, so `--text-muted`
 * (5.3:1 on white, comfortable) landed at 2.5–3.4:1 — an axe `color-contrast`
 * failure on four routes and counting. The maths has no rescue: even 0.9 opacity
 * only reaches ~4.4:1, still under AA's 4.5.
 *
 * Two rules, both WCAG:
 *   1.4.3 — the dimmed text failed contrast outright.
 *   1.4.1 — dimming ALONE conveys state by appearance, which is invisible to anyone
 *           who cannot perceive it. Hence the paired `StatusChip`, not just a colour.
 *
 * The replacement is `.bw-inactive` in globals.css: sunken surface, secondary text,
 * no opacity. This guard keeps the old pattern from coming back the next time
 * somebody needs a row to look "off".
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

/**
 * Files whose conditional opacity dims something that is NOT text, where the rule
 * does not apply. Each needs a reason.
 */
const NON_TEXT_OPACITY: Record<string, string> = {
  "components/ui/Eyebrow.tsx": "a 1px decorative rule, no glyphs",
  "components/ui/FillIndicator.tsx": "a 1px fill line inside a vessel graphic",
  "components/ui/SatelliteMap.tsx": "Leaflet raster/vector layer opacity, not DOM text",
  "app/(app)/vineyards/ndvi/NdviCompare.tsx": "NDVI raster layer opacity",
  "app/(app)/vineyards/weather/HourlyChart.tsx": "a chart legend swatch, not text",
  "app/(app)/bulk/TankTile.tsx": "an SVG wine-level fill behind the label, not the label",
  "app/(app)/inbox/ThreadView.tsx": "0.8 on a message byline — still above 4.5:1",
  "app/(app)/work-orders/new/WorkOrderBuilderClient.tsx": "0.85 on a dashed placeholder card, above 4.5:1",
  "app/(app)/assistant/AssistantChat.tsx": "dims an unchosen option CARD mid-confirmation, alongside a disabled control",
  "app/(app)/assistant/voice/VoiceInlinePanel.tsx": "mirrors a disabled button's own styling",
  "app/(app)/inbox/ComposeMessage.tsx": "transient in-flight state on a button, not a persistent row state",
  "app/(app)/blend/BlendBuilderClient.tsx": "dims vessel cards that are the blend's own source/destination during selection",
  "app/(app)/cellar/en-tirage/EnTirageClient.tsx": "an unchecked row's inline control, paired with the checkbox itself",
  "app/(app)/settings/SettingsClient.tsx": "a not-connected integration control, paired with cursor:not-allowed and its own copy",
  "app/(app)/setup/expendables/ingest/IngestReviewClient.tsx": "a skipped ingest line, paired with an explicit skip control",
  "app/(app)/lots/[id]/LotDetailClient.tsx": "dims a superseded timeline entry that carries its own correction label",
  "app/(app)/vineyards/field-notes/manager/BlockCard.tsx": "an <img> photo thumbnail — no glyphs to dim",
  "app/(app)/vineyards/harvest/admin/HarvestDashboard.tsx": "transient in-flight state while a save is pending, not a persistent row state",
  "components/observability/DevDiagnostics.tsx": "developer-only indicator, never rendered for an operator",
  // WCAG 1.4.3 exempts disabled controls from the contrast minimum outright, and the
  // design system's own disabled treatment is opacity (v2 §B6, see Button.tsx).
  "components/ui/Textarea.tsx": "a disabled form control — 1.4.3 exempts these by name",
  // opacity 0/1 is a SHOW/HIDE fade, not a dimmed state: at 0 there is nothing to read.
  "components/assistant/AssistantDock.tsx": "opacity 0<->1 open/close transition on the dock panel",
};

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("inactive/archived state is not conveyed by dimming text", () => {
  it("has no unreviewed conditional opacity", () => {
    // `opacity: <something> ? … : …` — a value that changes with state, as opposed to
    // a fixed decorative alpha.
    const conditional = /opacity:\s*[^,}\n]*\?[^,}\n]*:/;
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const rel = file.slice(SRC.length + 1).split(sep).join("/");
      if (NON_TEXT_OPACITY[rel]) continue;
      if (conditional.test(readFileSync(file, "utf8"))) offenders.push(rel);
    }
    expect(
      offenders,
      `these dim on state. If the dimmed thing contains TEXT, use the .bw-inactive ` +
        `class (sunken surface + secondary text) plus a StatusChip, because opacity ` +
        `drags muted text under 4.5:1 and dimming alone is state-by-appearance. If it ` +
        `is genuinely not text, add it to NON_TEXT_OPACITY with a reason:\n` +
        offenders.map((o) => `  ${o}`).join("\n"),
    ).toEqual([]);
  });

  it("keeps the replacement documented where someone will find it", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8");
    expect(css).toContain(".bw-inactive");
    expect(css, "the class must say WHY it is not opacity").toContain("4.5:1");
  });

  it("has no stale exemption", () => {
    const live = new Set(tsxFiles(SRC).map((f) => f.slice(SRC.length + 1).split(sep).join("/")));
    const stale = Object.keys(NON_TEXT_OPACITY).filter((f) => !live.has(f));
    expect(stale, "exempted files that no longer exist").toEqual([]);
  });

  it("is not vacuous — the pattern it hunts is the one that was there", () => {
    const conditional = /opacity:\s*[^,}\n]*\?[^,}\n]*:/;
    expect(conditional.test("style={{ opacity: r.isActive ? 1 : 0.55 }}")).toBe(true);
    expect(conditional.test("style={{ opacity: 0.55 }}")).toBe(false);
  });
});
