"use client";

// Keeps the required Google copyright string current as the viewport changes.
//
// Lives here rather than inline in SatelliteMap because the teardown ordering is the
// whole point (Sentry #324): the refresh is debounced, so a pending run can fire AFTER
// the map has been destroyed. Reading bounds off a removed Leaflet map throws
// "Cannot read properties of undefined (reading '_leaflet_pos')" — the map's panes are
// gone but the timer still holds a reference. Every entry point therefore re-checks
// cancellation, and the wiring self-destructs on Leaflet's "unload" event (fired by
// map.remove()) so no timer outlives the map.
//
// The map is typed structurally so this is unit-testable under node with no Leaflet
// and no DOM. L.Map satisfies it.

export interface AttributionBounds {
  getNorth(): number;
  getSouth(): number;
  getEast(): number;
  getWest(): number;
}

export interface AttributionControl {
  addAttribution(text: string): unknown;
  removeAttribution(text: string): unknown;
}

export interface AttributionMap {
  getBounds(): AttributionBounds;
  getZoom(): number;
  attributionControl: AttributionControl;
  on(type: string, fn: () => void): unknown;
  off(type: string, fn: () => void): unknown;
}

export interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface WireAttributionOptions {
  map: AttributionMap;
  /** True once the owning effect has been cleaned up — the map may already be removed. */
  isCancelled: () => boolean;
  /** Fetch the copyright string for a viewport. Returns "" on any failure (non-fatal). */
  fetchAttribution: (bounds: ViewportBounds, zoom: number) => Promise<string>;
  debounceMs?: number;
}

/**
 * Wire viewport-driven attribution refresh onto a map. Returns a teardown function;
 * it is also invoked automatically when the map fires "unload", so callers that cannot
 * hold the handle (an async basemap install) are still safe.
 */
export function wireAttributionRefresh({
  map,
  isCancelled,
  fetchAttribution,
  debounceMs = 400,
}: WireAttributionOptions): () => void {
  let last = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tornDown = false;

  const dead = () => tornDown || isCancelled();

  const refresh = async () => {
    // #324: the debounce can outlive the map. Bail BEFORE touching it, not after the
    // await — getBounds() on a removed map is what actually threw.
    if (dead()) return;
    const b = map.getBounds();
    const bounds: ViewportBounds = {
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    };
    const zoom = map.getZoom();
    const txt = await fetchAttribution(bounds, zoom);
    // Re-check: the map can be destroyed while the fetch is in flight.
    if (dead() || !txt || txt === last) return;
    if (last) map.attributionControl.removeAttribution(last);
    map.attributionControl.addAttribution(txt);
    last = txt;
  };

  const onMove = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void refresh();
    }, debounceMs);
  };

  const teardown = () => {
    tornDown = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    map.off("moveend", onMove);
    map.off("unload", teardown);
  };

  map.on("moveend", onMove);
  map.on("unload", teardown);
  void refresh();

  return teardown;
}
