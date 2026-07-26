// Unit 10's PURE half — the change derivation over the append-only stream (KD-8 / council C4)
// and the KD-13/C6 date-string discipline. The DB paths (partial unique, point-in-time query,
// split-pick coexistence) are proven in scripts/verify-spray-record.ts assertion 12.
import { describe, expect, it } from "vitest";
import { advanceCursor, deriveChangesSince, type PlannedHarvestEventRow } from "@/lib/harvest/planned-harvest-events";
import { parseISODateUTC, toISODateUTC } from "@/lib/fieldnotes/week";

const row = (over: Partial<PlannedHarvestEventRow>): PlannedHarvestEventRow => ({
  id: "e1",
  blockId: "blk1",
  vintageYear: 2026,
  harvestPassLabel: "main",
  plannedDate: "2026-10-10",
  version: 1,
  effectiveFrom: new Date("2026-07-01T10:00:00Z"),
  effectiveTo: null,
  status: "ACTIVE",
  enteredAt: new Date("2026-07-01T10:00:00Z"),
  ...over,
});

describe("KD-8 — direction derivation", () => {
  const stream: PlannedHarvestEventRow[] = [
    row({ id: "e1", version: 1, plannedDate: "2026-10-10", enteredAt: new Date("2026-07-01T10:00:00Z"), effectiveTo: new Date("2026-07-05T10:00:00Z"), status: "SUPERSEDED" }),
    row({ id: "e2", version: 2, plannedDate: "2026-09-30", enteredAt: new Date("2026-07-05T10:00:00Z"), effectiveTo: new Date("2026-07-09T10:00:00Z"), status: "SUPERSEDED" }),
    row({ id: "e3", version: 3, plannedDate: "2026-10-05", enteredAt: new Date("2026-07-09T10:00:00Z"), effectiveTo: new Date("2026-07-12T10:00:00Z"), status: "RETRACTED" }),
  ];

  it("SET, then PULLED_FORWARD, then PUSHED_BACK, then RETRACTED", () => {
    const changes = deriveChangesSince(stream, null);
    expect(changes.map((c) => c.direction)).toEqual(["SET", "PULLED_FORWARD", "PUSHED_BACK", "RETRACTED"]);
    expect(changes[1]).toMatchObject({ previousDate: "2026-10-10", newDate: "2026-09-30" });
    expect(changes[3]).toMatchObject({ previousDate: "2026-10-05", newDate: null });
  });

  it("replays every change after a cursor exactly once, and is idempotent from the same cursor", () => {
    const cursor = new Date("2026-07-05T10:00:00Z"); // after e2's insert
    const first = deriveChangesSince(stream, cursor);
    const again = deriveChangesSince(stream, cursor);
    expect(first).toEqual(again);
    expect(first.map((c) => c.direction)).toEqual(["PUSHED_BACK", "RETRACTED"]);
    // Consuming advances the cursor past everything; a re-read is then empty.
    const next = advanceCursor(first, cursor);
    expect(deriveChangesSince(stream, next)).toEqual([]);
  });

  it("a SET after a retraction is a SET, not a push/pull vs the retracted date", () => {
    const withRestart = [
      ...stream,
      row({ id: "e4", version: 4, plannedDate: "2026-10-20", enteredAt: new Date("2026-07-20T10:00:00Z") }),
    ];
    const changes = deriveChangesSince(withRestart, new Date("2026-07-15T10:00:00Z"));
    expect(changes).toHaveLength(1);
    expect(changes[0].direction).toBe("SET");
  });

  it("two pass labels on one block-vintage coexist and neither overwrites the other (council G4)", () => {
    const split = [
      row({ id: "a1", harvestPassLabel: "sparkling", plannedDate: "2026-08-25", enteredAt: new Date("2026-07-01T10:00:00Z") }),
      row({ id: "b1", harvestPassLabel: "still-red", plannedDate: "2026-09-28", enteredAt: new Date("2026-07-01T11:00:00Z") }),
    ];
    const changes = deriveChangesSince(split, null);
    expect(changes).toHaveLength(2);
    expect(new Set(changes.map((c) => c.harvestPassLabel))).toEqual(new Set(["sparkling", "still-red"]));
    expect(changes.every((c) => c.direction === "SET")).toBe(true);
  });
});

describe("KD-13 / council C6 — plannedDate is a STRING at every boundary", () => {
  it("a Pacific-timezone caller stores the date they typed (UTC-midnight round trip, no off-by-one)", () => {
    // The mechanism that prevents the shift: parseISODateUTC pins UTC midnight regardless of the
    // process TZ, and toISODateUTC reads back the UTC date — a local-time Date ctor would lose a
    // day for any US-timezone caller.
    const typed = "2026-09-20";
    const stored = parseISODateUTC(typed)!;
    expect(toISODateUTC(stored)).toBe(typed);
    expect(stored.getUTCHours()).toBe(0);
    // The plausible-but-wrong implementation: new Date("2026-09-20") interpreted in local time
    // then serialized via toLocaleDateString — pinned here as a negative assertion.
    expect(stored.toISOString()).toBe("2026-09-20T00:00:00.000Z");
  });

  it("rejects a non-calendar date", () => {
    expect(parseISODateUTC("2026-02-30")).toBeNull();
    expect(parseISODateUTC("2026-13-01")).toBeNull();
    expect(parseISODateUTC("Sept 20")).toBeNull();
  });
});
