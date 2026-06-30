import type { LotState } from "@/lib/ferment/state";

// Phase 6 Unit 11: cold soak + extended maceration are NOT a linear phase — they are points in the
// orthogonal (form × afState) space (council C1). This module names them so the UI/timeline can
// label a MUST lot's pre/post-ferment skin-contact correctly without a phase enum.
//
//   cold soak           = MUST + afState NONE   (pre-ferment skin/seed soak, cool, no yeast yet)
//   primary on skins    = MUST + afState ACTIVE  (reds fermenting on skins)
//   extended maceration = MUST + afState DRY     (sugar gone, still on skins — the linear enum
//                                                 couldn't express "dry but on skins")

/** A MUST lot before alcoholic ferment has started = cold soak / pre-ferment maceration. */
export function isColdSoak(s: Pick<LotState, "form" | "afState">): boolean {
  return s.form === "MUST" && s.afState === "NONE";
}

/** A MUST lot whose alcoholic ferment is dry but is still on skins = extended maceration. */
export function isExtendedMaceration(s: Pick<LotState, "form" | "afState">): boolean {
  return s.form === "MUST" && s.afState === "DRY";
}

/** A short human label for a MUST lot's current skin-contact phase (null for non-MUST). */
export function skinContactLabel(s: Pick<LotState, "form" | "afState">): string | null {
  if (s.form !== "MUST") return null;
  if (s.afState === "NONE") return "Cold soak";
  if (s.afState === "ACTIVE") return "On skins (primary)";
  return "Extended maceration";
}
