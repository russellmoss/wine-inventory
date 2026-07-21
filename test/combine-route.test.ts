import { describe, it, expect } from "vitest";
import { decideCombineRoute, type CombineLotState } from "@/lib/ledger/combine";

// A vessel holds one cohesive liquid. Every operation that puts wine into an occupied vessel
// answers the same question here: keep this lot (empty/same destination), absorb into the
// resident, or mint a new blend lot. Absorbing is the physical default, but it INHERITS the
// resident's identity — so it is refused whenever the two wines are not legally the same thing.

const lot = (over: Partial<CombineLotState> & { lotId: string }): CombineLotState => ({
  lotCode: over.lotId,
  form: "WINE",
  afState: "DRY",
  mlfState: "COMPLETE",
  taxClass: "A_LE16",
  ownership: "ESTATE",
  bondId: "bond-1",
  ...over,
});

const PINOT = lot({ lotId: "L-PINOT", lotCode: "24-PN-1" });
const CAB = lot({ lotId: "L-CAB", lotCode: "24-CS-1" });

describe("decideCombineRoute", () => {
  describe("KEEP — nothing to reconcile", () => {
    it("an empty destination is a plain move", () => {
      const d = decideCombineRoute({ destResidentLots: [], incoming: [CAB] });
      expect(d).toMatchObject({ ok: true, mode: "KEEP", residentLotId: null });
    });

    it("the same lot arriving is a merge, not a blend", () => {
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [PINOT] });
      expect(d).toMatchObject({ ok: true, mode: "KEEP", residentLotId: "L-PINOT" });
    });

    it("an empty destination accepts several incoming lots (they blend on arrival)", () => {
      const d = decideCombineRoute({ destResidentLots: [], incoming: [PINOT, CAB] });
      expect(d).toMatchObject({ ok: true, mode: "NEW_BLEND" });
    });
  });

  describe("ABSORB — the physical default", () => {
    it("a different lot arriving is absorbed into the resident by default", () => {
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [CAB] });
      expect(d).toMatchObject({ ok: true, mode: "ABSORB", residentLotId: "L-PINOT" });
    });

    it("the explicit new-blend escape overrides the default", () => {
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [CAB], explicit: "NEW_BLEND" });
      expect(d).toMatchObject({ ok: true, mode: "NEW_BLEND", residentLotId: "L-PINOT" });
    });

    it("asking to KEEP a foreign lot in an occupied vessel is refused", () => {
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [CAB], explicit: "KEEP" });
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.reason).toBe("keep-needs-empty-destination");
    });
  });

  describe("multiple incoming lots into an occupied vessel", () => {
    it("needs the new-blend escape stated explicitly", () => {
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [CAB, lot({ lotId: "L-SY", lotCode: "24-SY-1" })] });
      expect(d.ok).toBe(false);
      if (!d.ok) {
        expect(d.reason).toBe("multi-incoming-needs-new-blend");
        expect(d.requires).toBe("NEW_BLEND");
      }
    });

    it("is allowed once NEW_BLEND is explicit", () => {
      const d = decideCombineRoute({
        destResidentLots: [PINOT],
        incoming: [CAB, lot({ lotId: "L-SY", lotCode: "24-SY-1" })],
        explicit: "NEW_BLEND",
      });
      expect(d).toMatchObject({ ok: true, mode: "NEW_BLEND" });
    });

    it("several arrivals of the SAME lot are one identity, so they still absorb", () => {
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [CAB, CAB] });
      expect(d).toMatchObject({ ok: true, mode: "ABSORB" });
    });
  });

  describe("ABSORB is refused when the two wines are not legally the same thing", () => {
    it("differing tax class forces a new blend lot (TTB 5120.17 lines 5/20)", () => {
      const fortified = lot({ lotId: "L-PORT", lotCode: "24-PORT", taxClass: "B_16_21" });
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [fortified] });
      expect(d.ok).toBe(false);
      if (!d.ok) {
        expect(d.reason).toBe("tax-class-mismatch");
        expect(d.requires).toBe("NEW_BLEND");
        expect(d.message).toMatch(/tax class/i);
      }
    });

    it("and IS allowed once the new blend lot is explicit — the class gets re-derived", () => {
      const fortified = lot({ lotId: "L-PORT", lotCode: "24-PORT", taxClass: "B_16_21" });
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [fortified], explicit: "NEW_BLEND" });
      expect(d).toMatchObject({ ok: true, mode: "NEW_BLEND" });
    });

    it("differing ownership is refused outright — a client's wine never joins estate wine", () => {
      const client = lot({ lotId: "L-CC", lotCode: "24-CC-1", ownership: "CUSTOM_CRUSH_CLIENT" });
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [client] });
      expect(d.ok).toBe(false);
      if (!d.ok) {
        expect(d.reason).toBe("ownership-mismatch");
        expect(d.requires).toBeUndefined(); // no escape — this one is not a blend decision
      }
    });

    it("ownership cannot be escaped with NEW_BLEND either", () => {
      const client = lot({ lotId: "L-CC", lotCode: "24-CC-1", ownership: "CUSTOM_CRUSH_CLIENT" });
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [client], explicit: "NEW_BLEND" });
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.reason).toBe("ownership-mismatch");
    });

    it("differing bond is refused — that is a bond-to-bond transfer, not a rack", () => {
      const other = lot({ lotId: "L-B2", lotCode: "24-B2", bondId: "bond-2" });
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [other] });
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.reason).toBe("bond-mismatch");
    });

    it("pouring MUST into finished WINE is refused", () => {
      const must = lot({ lotId: "L-MUST", lotCode: "24-MUST", form: "MUST", afState: "NONE", mlfState: "NONE" });
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [must] });
      expect(d.ok).toBe(false);
      if (!d.ok) {
        expect(d.reason).toBe("form-mismatch");
        expect(d.message).toMatch(/must/i);
      }
    });

    it("a fermenting lot does not absorb into a dry one", () => {
      const fermenting = lot({ lotId: "L-AF", lotCode: "24-AF", afState: "ACTIVE" });
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [fermenting] });
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.reason).toBe("ferment-state-mismatch");
    });

    it("an MLF-active lot does not absorb into an MLF-complete one", () => {
      const mlf = lot({ lotId: "L-ML", lotCode: "24-ML", mlfState: "ACTIVE" });
      const d = decideCombineRoute({ destResidentLots: [PINOT], incoming: [mlf] });
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.reason).toBe("ferment-state-mismatch");
    });

    it("two MUST lots at the same stage absorb fine — a co-ferment is normal", () => {
      const mustA = lot({ lotId: "L-M1", lotCode: "24-SY-M", form: "MUST", afState: "ACTIVE", mlfState: "NONE" });
      const mustB = lot({ lotId: "L-M2", lotCode: "24-VG-M", form: "MUST", afState: "ACTIVE", mlfState: "NONE" });
      const d = decideCombineRoute({ destResidentLots: [mustA], incoming: [mustB] });
      expect(d).toMatchObject({ ok: true, mode: "ABSORB", residentLotId: "L-M1" });
    });
  });

  describe("a destination that already violates the invariant", () => {
    it("is refused, and says to repair the vessel first", () => {
      const d = decideCombineRoute({ destResidentLots: [PINOT, CAB], incoming: [lot({ lotId: "L-X", lotCode: "24-X" })] });
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.reason).toBe("destination-already-co-resident");
    });
  });

  describe("refusal copy speaks the winery's language", () => {
    const refusals = [
      decideCombineRoute({ destResidentLots: [PINOT], incoming: [lot({ lotId: "L-P", lotCode: "24-PORT", taxClass: "B_16_21" })] }),
      decideCombineRoute({ destResidentLots: [PINOT], incoming: [lot({ lotId: "L-C", lotCode: "24-CC", ownership: "CUSTOM_CRUSH_CLIENT" })] }),
      decideCombineRoute({ destResidentLots: [PINOT], incoming: [lot({ lotId: "L-M", lotCode: "24-MUST", form: "MUST" })] }),
      decideCombineRoute({ destResidentLots: [PINOT, CAB], incoming: [CAB] }),
    ];

    it("names the actual lot codes, never internal ids", () => {
      for (const d of refusals) {
        expect(d.ok).toBe(false);
        if (!d.ok) {
          expect(d.message).toMatch(/24-/); // a real lot code appears
          expect(d.message).not.toMatch(/L-[A-Z]/); // no internal lot ids
        }
      }
    });

    it("never leaks schema or invariant vocabulary at the winemaker", () => {
      for (const d of refusals) {
        if (!d.ok) {
          expect(d.message).not.toMatch(/vessel_lot|VesselLot|co-resident|co-residence|LEDGER-12|lotId/i);
        }
      }
    });

    it("every refusal tells the winemaker what to do instead (no dead ends)", () => {
      for (const d of refusals) {
        if (!d.ok) expect(d.message.length).toBeGreaterThan(40);
      }
    });
  });
});
