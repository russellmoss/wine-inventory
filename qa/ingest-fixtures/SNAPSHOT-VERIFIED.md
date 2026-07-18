# Ingest extraction snapshots — human verification log (Plan 072 Unit 12 STEP 1)

Raw extraction snapshots captured by `scripts/ingest-capture-snapshot.ts` running the REAL extractor
(`claude-opus-4-8`, native `document`/`image` blocks) over the actual files in `docs/invoice examples/`.

**These are NOT yet human-signed-off.** Each `qa/ingest-fixtures/<file>.json` carries `_verified: false`.
A human must open each PDF, confirm the extracted values below match, then flip `_verified: true` and check
the box here. The deterministic acceptance test (`test/ingest-acceptance.test.ts`, Unit 12 STEP 2) only trusts
`_verified: true` snapshots — until signed off it skips with a notice, so CI stays green but gains teeth once
a human confirms the real docs.

## De-risking spike result (Unit 4)
✅ `claude-opus-4-8` accepts native base64 PDF `document` blocks AND `output_config` json_schema. No PDF→PNG
raster fallback needed. Image-only/scanned PDFs (`crush to cellar.pdf`, `Laffort test strips.pdf`) extracted
via vision successfully.

## Captured vs. the plan's acceptance matrix (planning-time human inspection)
Every capture matched the expected classification + key fields in the plan's matrix:

| File | docType | currency | vendor | lines | invoice# | lots | shipping | total | ✓ verified |
|------|---------|----------|--------|-------|----------|------|----------|-------|-----------|
| Sales Invoice SIV535475.pdf | invoice | USD | Crush2Cellar LLC | 4 | SIV535475 | 2230517, 2025030373, 2250423, 2240110 | 147.99 | 533.78 | [ ] |
| Proforma-W583.1869.pdf | proforma | EUR | NexaParts B.V. | 2 | W583.1869 | — | 40 | 767.16 | [ ] |
| 2230517_COAFILE_20260714.pdf | coa | — | LAFFORT | 1 | — | 2230517 | — | — | [ ] |
| 2025030373_COAFILE_20260714.pdf | coa | — | AEB Brazil | 6 | — | 2025030373 | — | — | [ ] |
| 2240110_COAFILE_20260714.pdf | coa | — | LAFFORT | 1 | — | 2240110 | — | — | [ ] |
| NexaParts …Terms and Conditions B2B.pdf | other | — | NexaParts B.V. | 0 | — | — | — | — | [ ] |
| crush to cellar.pdf (image/scan) | invoice | USD | Crush2Cellar | 4 | SL1955201 | — | 147.99 | 533.78 | [ ] |
| Laffort test strips.pdf (image/scan) | invoice | USD | Laffort USA | 1 | S-O.152414 | 67.02 | 479.52 | [ ] |

### Notes for the human verifier
- **SIV535475 line math conserves:** Σ lineTotal (77.27 + 150 + 27.51 + 131.01 = 385.79) + shipping 147.99 =
  533.78 = invoiceTotal. Pack size lives in the DESCRIPTION ("250G", "5KG", "1KG") while `unit` is "Each" —
  the review screen (Unit 8) must let the human map "1 Each" → the pack size for a `g`-stocked material;
  Unit 5 correctly FLAGS a "Each"→"g" conversion as needing input rather than guessing.
- **crush to cellar.pdf is the same order as SIV535475** (an order-confirmation email; total/shipping match).
  A human would treat it as a duplicate, not a second receipt.
- **COA 2025030373** is from AEB (FermoPlus DAP Free) — matches the Scott Labs line lot `2025030373`.

## Sign-off
- [ ] All 8 snapshots human-verified against their PDFs and `_verified` flipped to `true`.
- Verified by: ________________   Date: ____________
