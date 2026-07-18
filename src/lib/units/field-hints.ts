// Plan 075: the qty / pack-size / unit explanations shown as tooltips at material intake. Kept as pure
// constants (client-safe, no imports) so the wording is unit-testable and shared verbatim between the invoice
// review screen and the manual "Add expendable" form — the two places users mix these fields up.

export const QTY_HINT =
  "How many packages you received. Example: 5 rolls of labels → Qty = 5.";

export const PACK_SIZE_HINT =
  "How many base items are in one package. Example: 500 labels per roll → Pack size = 500. The unit is the package itself (e.g. “roll”, “kg”, or “unit”).";

export const UNIT_HINT =
  "The unit one package is measured in — a standard unit (g, kg, mL, L, unit…) or one you create (“roll”, “drum”). Total stock = Qty × Pack size in this unit.";
