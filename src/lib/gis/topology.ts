/**
 * Vineyard Intelligence P1 — topology review of a planting area against its blocks (brief §2.2 step 6).
 *
 * PURE: no React, no Leaflet, no I/O. Runs the boolean ops (jsts) in one recentred UTM frame.
 *
 * WARN-ONLY (user decision, 2026-07-24): every finding is surfaced; NONE blocks a save. The `severity`
 * field still separates mask-breaking geometry (overlaps, block-outside-parent — they corrupt the
 * analysis mask) from benign facts (unassigned area — growers legitimately leave rocky outcrops, ponds,
 * headlands unplanted). CONSEQUENCE carried to P2: because broken geometry can persist, P2 must
 * re-validate the mask before computing NDVI stats rather than trust stored geometry.
 */
import type { VineyardPolygon } from "./geometry";
import { differencePolygons, intersectionPolygons, unionPolygons } from "./boolean";
import { projectedAreaM2 } from "./geometry-meta";

export type TopologySeverity = "MASK_BREAKING" | "ADVISORY" | "OK";

export type TopologyFindingCode =
  | "BLOCK_OUTSIDE_PARENT"
  | "SIBLING_OVERLAP"
  | "SLIVER"
  | "UNASSIGNED_AREA"
  | "SHARED_BOUNDARY_OK";

export type TopologyFinding = {
  code: TopologyFindingCode;
  severity: TopologySeverity;
  /** m² of the offending region (outside area, overlap area, unassigned area, or the sliver's area). */
  areaM2: number;
  /** ids of the block(s)/subject(s) the finding is about. */
  subjectIds: string[];
  message: string;
};

export type TopologySubject = { id: string; geometry: VineyardPolygon };

export type TopologyReview = {
  findings: TopologyFinding[];
  plantingAreaM2: number;
  blocksUnionAreaM2: number;
  unassignedAreaM2: number;
};

export type TopologyOptions = {
  /** Regions/blocks below this area (m²) are treated as slivers/negligible. Default 1 m². */
  sliverFloorM2?: number;
};

/**
 * PURE: review a planting area against its blocks. All findings are warnings; read `severity` to
 * style/prioritise. Areas reconcile: plantingAreaM2 ≈ blocksUnionAreaM2 + unassignedAreaM2.
 */
export function reviewTopology(
  input: { planting: TopologySubject; blocks: TopologySubject[] },
  opts: TopologyOptions = {},
): TopologyReview {
  const floor = opts.sliverFloorM2 ?? 1;
  const { planting, blocks } = input;
  const findings: TopologyFinding[] = [];

  const plantingAreaM2 = projectedAreaM2(planting.geometry);

  // 1) Each block: the part lying OUTSIDE the parent (brief §2.3 "block fully covered by its parent").
  for (const b of blocks) {
    const outside = differencePolygons(b.geometry, planting.geometry);
    const outsideArea = outside ? projectedAreaM2(outside) : 0;
    if (outsideArea > floor) {
      findings.push({
        code: "BLOCK_OUTSIDE_PARENT",
        severity: "MASK_BREAKING",
        areaM2: outsideArea,
        subjectIds: [b.id],
        message: `Block extends ${outsideArea.toFixed(1)} m² outside its planting area.`,
      });
    }
  }

  // 2) Sibling overlaps (brief §2.3 "sibling blocks should not overlap").
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const inter = intersectionPolygons(blocks[i].geometry, blocks[j].geometry);
      const overlapArea = inter ? projectedAreaM2(inter) : 0;
      if (overlapArea > floor) {
        findings.push({
          code: "SIBLING_OVERLAP",
          severity: "MASK_BREAKING",
          areaM2: overlapArea,
          subjectIds: [blocks[i].id, blocks[j].id],
          message: `Blocks overlap by ${overlapArea.toFixed(1)} m² (pixels would be double-counted).`,
        });
      }
    }
  }

  // 3) Slivers: any block smaller than the floor.
  for (const b of blocks) {
    const a = projectedAreaM2(b.geometry);
    if (a < floor) {
      findings.push({
        code: "SLIVER",
        severity: "ADVISORY",
        areaM2: a,
        subjectIds: [b.id],
        message: `Block is a ${a.toFixed(2)} m² sliver.`,
      });
    }
  }

  // 4) Unassigned planting area (brief §2.2 "show it explicitly rather than silently losing it").
  //    Holes in the planting are already excluded from plantingAreaM2, so a hole is NOT a gap.
  let blocksUnionAreaM2 = 0;
  let unassignedAreaM2 = plantingAreaM2;
  if (blocks.length > 0) {
    const union = unionPolygons(blocks.map((b) => b.geometry));
    blocksUnionAreaM2 = projectedAreaM2(union);
    const unassigned = differencePolygons(planting.geometry, union);
    unassignedAreaM2 = unassigned ? projectedAreaM2(unassigned) : 0;
    if (unassignedAreaM2 > floor) {
      findings.push({
        code: "UNASSIGNED_AREA",
        severity: "ADVISORY",
        areaM2: unassignedAreaM2,
        subjectIds: [planting.id],
        message: `${unassignedAreaM2.toFixed(1)} m² of the planting is not covered by any block.`,
      });
    }
  }

  // 5) Positive signal: ≥2 blocks tile the planting cleanly (no overlap, no meaningful gap).
  const hasBreaking = findings.some((f) => f.severity === "MASK_BREAKING");
  if (blocks.length >= 2 && !hasBreaking && unassignedAreaM2 <= floor) {
    findings.push({
      code: "SHARED_BOUNDARY_OK",
      severity: "OK",
      areaM2: 0,
      subjectIds: blocks.map((b) => b.id),
      message: "Blocks tile the planting with shared boundaries and no gaps.",
    });
  }

  return { findings, plantingAreaM2, blocksUnionAreaM2, unassignedAreaM2 };
}
