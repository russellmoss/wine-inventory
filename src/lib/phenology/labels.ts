// Spray Intelligence S4 — the honesty copy, as PURE functions (council S3).
//
// This repo has no jsdom and no React Testing Library, so a rule like "the word 'estimated' must
// appear in TEXT, never colour alone" and "a gap renders as unknown, never as clear" would
// otherwise be unverifiable by CI and left entirely to a human remembering to look. Extracting the
// strings here makes them ordinary unit tests. Browser QA then confirms PLACEMENT, not correctness.
//
// Two rules govern every string below:
//   §3.5  Estimated is labelled estimated, WITH THE ESTIMATOR NAMED. A grower must be able to tell
//         measured from modelled at a glance.
//   §3.6  A coverage gap must never render as "no restriction". Unknown is visually and verbally
//         distinct from clear — never "none", never "no damage", never "clear".
//
// Council S8: the badge carries the ANCHOR AGE. "Estimated" alone does not tell a grower that
// THEIR OWN missed observation caused the guess. "Estimated — last observed 12 days ago" does, and
// it turns an honesty label into a nudge to go and measure.

import type { PhenologyBlockDTO } from "@/lib/phenology/dto";
import type { PhenologySource } from "@/lib/phenology/stage-core";
import { formatShootLength, formatShootLengthRange } from "@/lib/phenology/units";
import type { ClusterDamage, VinegarFlyPressure } from "@/lib/phenology/observation-types";

export type ChipTone = "neutral" | "green" | "red" | "amber";
export type PhenologyChip = { text: string; tone: ChipTone };

function pretty(v: string): string {
  return v
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "12 days ago" / "yesterday" / "today" — the age half of the S8 badge. */
export function formatAnchorAge(days: number | null): string {
  if (days === null) return "date unknown";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * The provenance badge. Both derived tiers contain the word "estimated" and NAME the estimator,
 * so neither can be mistaken for a measurement.
 */
export function stageSourceLabel(source: PhenologySource | null, anchorAgeDays: number | null): string {
  switch (source) {
    case "OBSERVED":
      return "Observed in the field";
    case "INTERPOLATED":
      return `Estimated (degree-day interpolation between two field observations) — last observed ${formatAnchorAge(anchorAgeDays)}`;
    case "MODELED":
      return `Estimated (degree-day model projected past the last field observation) — last observed ${formatAnchorAge(anchorAgeDays)}`;
    default:
      return "Not known — no stage estimate is available for this block";
  }
}

/** Short badge text for a chip, where the long sentence will not fit. Still says "estimated". */
export function stageSourceBadge(source: PhenologySource | null, anchorAgeDays: number | null): string {
  switch (source) {
    case "OBSERVED":
      return "Observed";
    case "INTERPOLATED":
    case "MODELED":
      return `Estimated — last observed ${formatAnchorAge(anchorAgeDays)}`;
    default:
      return "Not known";
  }
}

/**
 * The stage line itself. When the stage is unknown this renders the REASON, and it deliberately
 * contains none of the words that read as an all-clear — a grower glancing at this must never
 * come away thinking the block was checked and found fine.
 */
export function stageLabel(dto: PhenologyBlockDTO): string {
  if (dto.stage === null) {
    return `Stage not known — ${dto.stageReason ?? "not enough information to estimate it"}`;
  }
  const pct = dto.stagePct != null ? ` ${dto.stagePct}%` : "";
  return `${pretty(dto.stage)}${pct}`;
}

/** Growth for display. A range stays a range; a refusal says so and names why. */
export function growthLabel(dto: PhenologyBlockDTO, unitSystem: "METRIC" | "IMPERIAL"): string {
  if (dto.cmPerWeek !== null) {
    return `Growing ${formatShootLength(dto.cmPerWeek, unitSystem)}/week (measured)`;
  }
  if (dto.cmPerWeekRange) {
    return `Growing ${formatShootLengthRange(dto.cmPerWeekRange.min, dto.cmPerWeekRange.max, unitSystem)}/week (estimated from a shoot-length band, so it is a range not a figure)`;
  }
  return `Growth rate not known — ${dto.growthReason ?? "not enough shoot-length observations"}`;
}

/** The share of leaf area laid down since a spray. Categorical framing, never bare precision. */
export function unprotectedLabel(dto: PhenologyBlockDTO): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (dto.unprotectedNewLeafFraction !== null) {
    const base =
      dto.growthBasis === "LEAF_EXPANSION_TAIL"
        ? " (estimated — leaf area keeps expanding after the shoot tip stops)"
        : "";
    return `About ${pct(dto.unprotectedNewLeafFraction)} of leaf area is new since the spray${base}`;
  }
  if (dto.unprotectedNewLeafRange) {
    return `Between ${pct(dto.unprotectedNewLeafRange.min)} and ${pct(dto.unprotectedNewLeafRange.max)} of leaf area is new since the spray (estimated from a band, so it is a range)`;
  }
  return "New leaf area since the spray is not known";
}

/**
 * A scouting value for display. The THREE states are three different sentences — a gap can never
 * be read as a clean result, which is the whole reason NOT_ASSESSED is a value at all.
 */
export function scoutingLabel(
  field: "clusterDamage" | "vinegarFlyPressure",
  value: ClusterDamage | VinegarFlyPressure | null,
): string {
  const name = field === "clusterDamage" ? "Cluster damage" : "Vinegar-fly pressure";
  if (value === null) return `${name}: not recorded — nobody has checked this block`;
  if (value === "NOT_ASSESSED") return `${name}: not assessed — the block was visited but this was not checked`;
  if (value === "NONE") return `${name}: none seen (checked)`;
  return `${name}: ${pretty(value)}`;
}

/** The read-back chips for one block. `NoteDetail` renders these; nothing else builds chip text. */
export function phenologyChips(dto: PhenologyBlockDTO, unitSystem: "METRIC" | "IMPERIAL"): PhenologyChip[] {
  const chips: PhenologyChip[] = [];

  chips.push({ text: stageLabel(dto), tone: dto.stage === null ? "amber" : "neutral" });
  if (dto.stage !== null) {
    chips.push({
      text: stageSourceBadge(dto.stageSource, dto.anchorAgeDays),
      tone: dto.stageSource === "OBSERVED" ? "green" : "amber",
    });
  }
  if (dto.boundaryRisk) {
    chips.push({ text: "Close to a stage change — estimate, confirm before acting", tone: "amber" });
  }
  if (dto.shootsAtLeast10cm !== null) {
    chips.push({
      text: dto.shootsAtLeast10cm ? "Shoots ≥ 10 cm" : "Shoots under 10 cm",
      tone: "neutral",
    });
  }
  if (dto.cmPerWeek !== null || dto.cmPerWeekRange) {
    chips.push({ text: growthLabel(dto, unitSystem), tone: dto.cmPerWeek !== null ? "neutral" : "amber" });
  }
  if (dto.hedgedThisWeek === true) chips.push({ text: "Hedged this week", tone: "neutral" });
  if (dto.fruitZoneLeafRemoval !== null && dto.fruitZoneLeafRemoval !== "NONE") {
    chips.push({ text: `Fruit-zone leaf removal: ${pretty(dto.fruitZoneLeafRemoval)}`, tone: "neutral" });
  }
  if (dto.clusterDamage !== null) {
    chips.push({
      text: scoutingLabel("clusterDamage", dto.clusterDamage),
      tone: dto.clusterDamage === "NONE" ? "green" : dto.clusterDamageScouted ? "red" : "amber",
    });
  }
  if (dto.vinegarFlyPressure !== null) {
    chips.push({
      text: scoutingLabel("vinegarFlyPressure", dto.vinegarFlyPressure),
      tone: dto.vinegarFlyPressure === "NONE" ? "green" : dto.vinegarFlyScouted ? "red" : "amber",
    });
  }
  return chips;
}
