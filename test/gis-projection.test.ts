import { describe, it, expect } from "vitest";
import {
  createProjector,
  createProjectorForBbox,
  utmZone,
  utmEpsg,
  ulpAt,
  projectRings,
  GEOM_EPSILON_M,
} from "@/lib/gis/projection";
import type { LinearRing, VineyardPolygon } from "@/lib/gis/geometry";

/** A ~700 m square near Charlottesville VA — UTM 17N, northern hemisphere. */
const VA_RING: LinearRing = [
  [-78.5, 38.03],
  [-78.492, 38.03],
  [-78.492, 38.036],
  [-78.5, 38.036],
  [-78.5, 38.03],
];
const VA: VineyardPolygon = { type: "Polygon", coordinates: [VA_RING] };

/** A small block in Bhutan — UTM 46N, the live tenant's hemisphere/zone. */
const BT: VineyardPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [89.63, 27.46],
      [89.636, 27.46],
      [89.636, 27.465],
      [89.63, 27.465],
      [89.63, 27.46],
    ],
  ],
};

/** Southern hemisphere — Marlborough NZ, UTM 59S. */
const NZ: VineyardPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [173.85, -41.52],
      [173.858, -41.52],
      [173.858, -41.514],
      [173.85, -41.514],
      [173.85, -41.52],
    ],
  ],
};

describe("utmZone / utmEpsg", () => {
  it("maps longitudes to the standard 6-degree zones", () => {
    expect(utmZone(-177)).toBe(1);
    expect(utmZone(-75)).toBe(18);
    expect(utmZone(-78.5)).toBe(17);
    expect(utmZone(0)).toBe(31);
    expect(utmZone(177)).toBe(60);
  });

  it("clamps the antimeridian rather than producing zone 61", () => {
    expect(utmZone(180)).toBe(60);
    expect(utmZone(-180)).toBe(1);
  });

  it("picks the 326xx band in the north and 327xx in the south", () => {
    expect(utmEpsg(-78.5, 38.03)).toBe("EPSG:32617");
    expect(utmEpsg(173.85, -41.52)).toBe("EPSG:32759");
  });
});

describe("projector round-trip", () => {
  const cases: [string, VineyardPolygon][] = [
    ["Virginia (UTM 17N)", VA],
    ["Bhutan (UTM 46N)", BT],
    ["New Zealand (UTM 59S)", NZ],
  ];

  for (const [label, geom] of cases) {
    it(`round-trips ${label} to sub-millimetre over the whole extent`, () => {
      const p = createProjector(geom);
      const ring = geom.coordinates[0] as LinearRing;
      for (const pos of ring) {
        const back = p.inverse(p.forward(pos));
        // convert the lon/lat residual to metres before judging it
        const dLatM = (back[1] - pos[1]) * 111_320;
        const dLonM = (back[0] - pos[0]) * 111_320 * Math.cos((pos[1] * Math.PI) / 180);
        const errM = Math.hypot(dLatM, dLonM);
        expect(errM).toBeLessThan(1e-3);
      }
    });
  }

  it("puts the AOI centre within a metre of the local origin", () => {
    const p = createProjector(VA);
    const [cx, cy] = [(-78.5 + -78.492) / 2, (38.03 + 38.036) / 2];
    const [x, y] = p.forward([cx, cy]);
    expect(Math.hypot(x, y)).toBeLessThan(1);
  });

  it("keeps recentred coordinates small, which is the whole point", () => {
    const p = createProjector(VA);
    for (const pos of VA_RING) {
      const [x, y] = p.forward(pos);
      // a vineyard-scale AOI must land within ~1 km of its own origin, not at UTM magnitudes
      expect(Math.abs(x)).toBeLessThan(1000);
      expect(Math.abs(y)).toBeLessThan(1000);
    }
  });

  it("is exactly invertible in the projected plane (recentring adds no error)", () => {
    const p = createProjectorForBbox([-78.5, 38.03, -78.492, 38.036]);
    const pt: [number, number] = [123.456, -789.012];
    const back = p.forward(p.inverse(pt));
    expect(back[0]).toBeCloseTo(pt[0], 6);
    expect(back[1]).toBeCloseTo(pt[1], 6);
  });
});

describe("distances survive the projection", () => {
  /**
   * Metres per degree of longitude at latitude phi on the WGS84 ellipsoid.
   * The naive `111320 * cos(phi)` spherical form is ~0.13% wrong at mid latitudes — enough to
   * swamp what we are actually trying to measure, so this uses the radius of curvature in the
   * prime vertical. This gives the test an independent analytic reference rather than a
   * restatement of what proj4 already believes.
   */
  function metresPerDegreeLon(latDeg: number): number {
    const a = 6_378_137;
    const e2 = 0.006_694_379_990_14;
    const phi = (latDeg * Math.PI) / 180;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    return (Math.PI / 180) * N * Math.cos(phi);
  }

  it("reproduces a known ground distance in metres", () => {
    const p = createProjector(VA);
    const a = p.forward([-78.5, 38.033]);
    const b = p.forward([-78.492, 38.033]);
    const measured = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const expected = 0.008 * metresPerDegreeLon(38.033);
    // Residual is the UTM scale factor (0.9996 on the central meridian, rising toward the zone
    // edge). Zone 17's CM is -81 and we sit 2.5 deg east of it, so this stays well inside 0.1%.
    expect(Math.abs(measured - expected) / expected).toBeLessThan(1e-3);
  });

  it("area scales correctly — a 100m x 100m square measures 10,000 m^2", () => {
    const p = createProjector(VA);
    const lat = 38.033;
    const dLon = 100 / metresPerDegreeLon(lat);
    const dLat = 100 / 110_996; // metres per degree latitude at ~38 deg
    const c0 = p.forward([-78.5, lat]);
    const c1 = p.forward([-78.5 + dLon, lat]);
    const c2 = p.forward([-78.5, lat + dLat]);
    const w = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
    const h = Math.hypot(c2[0] - c0[0], c2[1] - c0[1]);
    expect(w * h).toBeGreaterThan(9_950);
    expect(w * h).toBeLessThan(10_050);
  });
});

describe("zone handling", () => {
  it("flags an AOI that straddles a zone boundary instead of silently accepting it", () => {
    // zone 17/18 boundary sits at -78
    const straddling = createProjectorForBbox([-78.2, 38.0, -77.8, 38.1]);
    expect(straddling.spansMultipleZones).toBe(true);
    // and it still pins ONE zone, chosen from the centre
    expect(straddling.zone).toBe(utmZone(-78.0));
  });

  it("does not flag an ordinary vineyard-sized AOI", () => {
    expect(createProjector(VA).spansMultipleZones).toBe(false);
  });
});

describe("the epsilon has the headroom it claims", () => {
  it("sits far above float64 spacing at recentred scale and far below a pixel", () => {
    const recentredUlp = ulpAt(500); // ~500 m from origin, a large vineyard
    expect(GEOM_EPSILON_M).toBeGreaterThan(recentredUlp * 1e6);
    expect(GEOM_EPSILON_M).toBeLessThan(10 / 1e5); // orders below a 10 m pixel
  });

  it("recentring buys real precision — raw UTM magnitudes are far coarser", () => {
    const rawUlp = ulpAt(4_300_000); // a typical UTM northing
    const recentredUlp = ulpAt(500);
    expect(rawUlp).toBeGreaterThan(recentredUlp * 1000);
  });
});

describe("projectRings", () => {
  it("projects every ring including holes, preserving ring count", () => {
    const withHole: VineyardPolygon = {
      type: "Polygon",
      coordinates: [
        VA_RING,
        [
          [-78.497, 38.032],
          [-78.495, 38.032],
          [-78.495, 38.034],
          [-78.497, 38.034],
          [-78.497, 38.032],
        ],
      ],
    };
    const p = createProjector(withHole);
    const rings = projectRings(withHole, p);
    expect(rings.length).toBe(2);
    expect(rings[0].length).toBe(5);
    expect(rings[1].length).toBe(5);
  });

  it("flattens a MultiPolygon's parts into one ring list", () => {
    const multi: VineyardPolygon = { type: "MultiPolygon", coordinates: [[VA_RING], [VA_RING]] };
    const p = createProjector(multi);
    expect(projectRings(multi, p).length).toBe(2);
  });
});
