import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { wireAttributionRefresh, type AttributionMap } from "@/lib/map/attribution-refresh";

// Sentry #324: "Cannot read properties of undefined (reading '_leaflet_pos')".
// The attribution refresh is debounced 400ms; the map can be removed inside that
// window, and the old code called map.getBounds() unconditionally when the timer
// fired. These tests pin the teardown ordering with a fake map — no Leaflet, no DOM.

type Handler = () => void;

function makeMap() {
  const listeners = new Map<string, Set<Handler>>();
  const calls = { getBounds: 0, added: [] as string[], removed: [] as string[] };
  let removed = false;

  const map: AttributionMap = {
    getBounds() {
      calls.getBounds++;
      // Leaflet reads the pane position here; after remove() the pane is gone.
      if (removed) throw new TypeError("Cannot read properties of undefined (reading '_leaflet_pos')");
      return { getNorth: () => 1, getSouth: () => 0, getEast: () => 1, getWest: () => 0 };
    },
    getZoom: () => 12,
    attributionControl: {
      addAttribution(text: string) {
        calls.added.push(text);
        return undefined;
      },
      removeAttribution(text: string) {
        calls.removed.push(text);
        return undefined;
      },
    },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
      return undefined;
    },
    off(type, fn) {
      listeners.get(type)?.delete(fn);
      return undefined;
    },
  };

  return {
    map,
    calls,
    fire(type: string) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn();
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
    /** Mimic L.Map.remove(): fire "unload", then make the panes unreadable. */
    remove() {
      this.fire("unload");
      removed = true;
    },
  };
}

describe("wireAttributionRefresh", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("applies the fetched attribution on the initial refresh", async () => {
    const h = makeMap();
    wireAttributionRefresh({
      map: h.map,
      isCancelled: () => false,
      fetchAttribution: async () => "Imagery ©Google",
    });
    await vi.runAllTimersAsync();
    expect(h.calls.added).toEqual(["Imagery ©Google"]);
  });

  it("swaps the old attribution rather than stacking duplicates", async () => {
    const h = makeMap();
    let text = "first";
    wireAttributionRefresh({
      map: h.map,
      isCancelled: () => false,
      fetchAttribution: async () => text,
    });
    await vi.runAllTimersAsync();
    text = "second";
    h.fire("moveend");
    await vi.runAllTimersAsync();
    expect(h.calls.removed).toEqual(["first"]);
    expect(h.calls.added).toEqual(["first", "second"]);
  });

  it("debounces a burst of moveend into one refresh", async () => {
    const h = makeMap();
    const fetchAttribution = vi.fn(async () => "");
    wireAttributionRefresh({ map: h.map, isCancelled: () => false, fetchAttribution });
    await vi.runAllTimersAsync();
    fetchAttribution.mockClear();
    h.fire("moveend");
    h.fire("moveend");
    h.fire("moveend");
    await vi.runAllTimersAsync();
    expect(fetchAttribution).toHaveBeenCalledTimes(1);
  });

  it("#324: a pending refresh never touches the map after removal", async () => {
    const h = makeMap();
    let cancelled = false;
    wireAttributionRefresh({
      map: h.map,
      isCancelled: () => cancelled,
      fetchAttribution: async () => "Imagery ©Google",
    });
    await vi.runAllTimersAsync();
    const boundsReadsBefore = h.calls.getBounds;

    h.fire("moveend"); // arms the 400ms debounce
    // The owning effect tears down mid-debounce, exactly as SatelliteMap's cleanup does.
    cancelled = true;
    h.remove();

    await vi.runAllTimersAsync(); // old code threw here
    expect(h.calls.getBounds).toBe(boundsReadsBefore);
  });

  it("#324: unload alone clears the pending timer, even without isCancelled", async () => {
    const h = makeMap();
    wireAttributionRefresh({
      map: h.map,
      isCancelled: () => false, // the async basemap install has no handle to flip
      fetchAttribution: async () => "Imagery ©Google",
    });
    await vi.runAllTimersAsync();
    const boundsReadsBefore = h.calls.getBounds;

    h.fire("moveend");
    h.remove();

    await vi.runAllTimersAsync();
    expect(h.calls.getBounds).toBe(boundsReadsBefore);
  });

  it("drops attribution arriving after teardown (fetch still in flight)", async () => {
    const h = makeMap();
    let release: (v: string) => void = () => {};
    wireAttributionRefresh({
      map: h.map,
      isCancelled: () => false,
      fetchAttribution: () => new Promise<string>((r) => (release = r)),
    });
    h.remove();
    release("Imagery ©Google");
    await vi.runAllTimersAsync();
    expect(h.calls.added).toEqual([]);
  });

  it("teardown unsubscribes both listeners", async () => {
    const h = makeMap();
    const teardown = wireAttributionRefresh({
      map: h.map,
      isCancelled: () => false,
      fetchAttribution: async () => "",
    });
    await vi.runAllTimersAsync();
    expect(h.listenerCount("moveend")).toBe(1);
    teardown();
    expect(h.listenerCount("moveend")).toBe(0);
    expect(h.listenerCount("unload")).toBe(0);
  });
});
