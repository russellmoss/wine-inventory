# TTB F 5000.24sm — Excise Tax Return (wine portion) — reference

Source form for the **plan-026** wine excise-tax return (Phase 14 follow-on to the 5120.17 operations
report). This form is a **combined** federal excise return (spirits / wine / beer / tobacco); we compute
and fill the **wine line only** — everything else stays blank/zero.

## Contents
- `f500024sm.pdf` — the official form (TTB F 5000.24sm, **rev. 11/2016**, OMB 1513-0083), as downloaded.
  pdf-lib CANNOT load this raw file (object-stream/xref quirk + the form's JS) — it reports 0 fields.
- `TTB-5000.24-fillable.pdf` — the **pypdf-normalized** copy pdf-lib fills at runtime (committed asset).

## Regenerating the fillable copy (only on a form-version bump)
```bash
# 1. Normalize the raw TTB PDF into a pdf-lib-loadable fillable copy (pypdf >= 6):
python - <<'PY'
from pypdf import PdfReader, PdfWriter
r = PdfReader("docs/ttb-5000-24/f500024sm.pdf")
if r.is_encrypted:
    r.decrypt("")
w = PdfWriter()
w.clone_document_from_reader(r)          # carries pages + AcroForm + field defs
w.set_need_appearances_writer(True)      # so viewers render the values we fill
with open("docs/ttb-5000-24/TTB-5000.24-fillable.pdf", "wb") as f:
    w.write(f)
PY
# 2. Re-verify + re-emit the committed field map:
npx tsx scripts/calibrate-ttb-5000-24-fields.ts
```
The key steps are `clone_document_from_reader` + `set_need_appearances_writer(True)`.

## Form structure we fill (wine + header + payment + Schedule B)
- **Line 10 (`Tax.10`)** — WINE: the GROSS wine excise tax (Σ gallons removed × per-class rate).
- **Line 17 / 19** — total liability / gross due (wine-only → equal to line 10).
- **Schedule B (`Item30.a/.b`, `Item33.b`, `Item34`)** — the CBMA small-producer credit as a
  decreasing adjustment: col (a) explanation, col (b) TAX = credit $; line 34 → **line 20 (`Tax.20`)**.
- **Line 21 (`Tax.21`) / `Payment_Amount`** — AMOUNT TO BE PAID = line 19 − line 20 = the NET tax.
- **Header** — `Serial_Number`, `Employer_ID` (EIN), `Plant_No` (registry), `Taxpayer_Address`,
  `Date_On_Form`; `Return_Covers` = `PERIOD` + `Beginning`/`Ending` from the return period.
- **`info.*`** mirror fields + **`req.*`** "REQUIRED!" hint fields are cleared at fill (the form's own
  clearing script can't run under pdf-lib), same pattern as the 5120.17.

## CBMA credit placement (v1 decision — verify before relying on the PDF for filing)
The plan text is internally inconsistent on line 10 (Decision table says "net", D5 Pay.gov panel implies
gross + a separate Schedule B credit). v1 implements the **internally-consistent, form-accurate** reading:
**line 10 = gross**, credit in **Schedule B → line 20**, line 21 = net. The Pay.gov data-entry panel is
the PRIMARY deliverable (D5); the filled PDF is the secondary "for your records" copy.

Rates + CBMA ladder: `src/lib/compliance/excise-rates.ts` + `cbma.ts` (date-stamped, re-verify notes).
