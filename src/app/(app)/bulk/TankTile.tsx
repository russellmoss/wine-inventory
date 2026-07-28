"use client";

import React from "react";
import { StatusChip, FillIndicator, VesselIdentityBlock } from "@/components/ui";
import { TANK_STATE_LABEL, TANK_STATE_VARIANT, type TankState } from "@/lib/vessels/tank-state";
import { TILE_MIN_HEIGHT, TILE_MIN_WIDTH } from "@/lib/vessels/board-layout";
import type { Fill } from "@/lib/vessels/fill";
import { formatVolume } from "@/lib/units/display";
import { useUnitPrefs } from "@/components/units/UnitsProvider";

export type TankTileData = {
  id: string;
  code: string;
  /** Null only when the tank genuinely holds nothing. AC-S22 lives in the identity block. */
  lotCode: string | null;
  wineName: string | null;
  groupName: string | null;
  state: TankState;
  fill: Fill;
  capacityL: number;
  lotCodes: string[];
  /**
   * Composition recorded but no ledger occupancy — the real "partial" case (SC-10 lists a
   * failed lot lookup, but the lot is joined in the same query, so there is nothing to retry).
   */
  wineUnknown: boolean;
};

/**
 * One tank on the board.
 *
 * The whole tile is one control with one accessible name, not four nested ones: a cellar
 * hand tabbing the board should hear "T-04, 25-PN-04, fermenting, 2,140 of 5,000 litres",
 * once, and the fill bar and the chip glyph are decorative because that sentence already
 * carries everything they encode.
 */
export function TankTile({ tile, onOpen }: { tile: TankTileData; onOpen: (id: string) => void }) {
  const vol = useUnitPrefs().volume;
  const filled = formatVolume(tile.fill.filledL, vol);
  const capacity = formatVolume(tile.capacityL, vol);

  const wineWords = tile.wineUnknown ? "wine unknown" : tile.lotCode ?? "empty";
  const label = `Tank ${tile.code}, ${wineWords}, ${TANK_STATE_LABEL[tile.state].toLowerCase()}, ${filled} of ${capacity}`;

  return (
    <button
      type="button"
      onClick={() => onOpen(tile.id)}
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 10,
        minWidth: TILE_MIN_WIDTH,
        minHeight: TILE_MIN_HEIGHT,
        padding: 10,
        textAlign: "left",
        background: "var(--surface-raised)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        fontFamily: "var(--font-body)",
      }}
    >
      <FillIndicator
        fill={tile.fill}
        orientation="vertical"
        track={TILE_MIN_HEIGHT - 20}
        text={null}
        style={{ gap: 0 }}
      />
      {/* No `aria-hidden` here. The button's `aria-label` already wins the accessible-name
          computation, and hiding the subtree would only risk the aria-hidden-focus failure
          Phase 3's axe gate caught the last time a subtree was blanket-hidden. */}
      <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
        <VesselIdentityBlock
          code={tile.code}
          lotCode={tile.wineUnknown ? "wine unknown" : tile.lotCode}
          wineName={tile.wineName}
          groupName={tile.groupName}
          size="tile"
        />
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <StatusChip variant={TANK_STATE_VARIANT[tile.state]}>{TANK_STATE_LABEL[tile.state]}</StatusChip>
        </span>
        <span style={{ fontSize: 11.5, color: tile.fill.over ? "var(--danger)" : "var(--text-muted)", whiteSpace: "nowrap" }}>
          {filled} / {capacity}
        </span>
      </span>
    </button>
  );
}

/**
 * Loading tiles: real size, real grid (SC-10 — "never a spinner over an empty page"). The
 * board's shape is known before its contents are, so showing it is honest and stops the
 * page reflowing under the reader's eyes when the data lands.
 */
export function TankTileSkeleton() {
  return (
    <div
      aria-hidden="true"
      style={{
        minWidth: TILE_MIN_WIDTH,
        minHeight: TILE_MIN_HEIGHT,
        border: "1px solid var(--border-subtle, var(--border-strong))",
        borderRadius: "var(--radius-md)",
        background: "var(--surface-sunken, var(--paper-200))",
        opacity: 0.55,
      }}
    />
  );
}
