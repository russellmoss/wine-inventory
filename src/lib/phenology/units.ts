// Spray Intelligence S4 — shoot-length formatting.
//
// The deviation this file used to document is RESOLVED: plan 098 created the app-wide display-unit
// authority (`src/lib/units/display.ts`) and the cm→in conversion moved there, exactly as the
// runbook §4 shared-file map promised ("folds into the shared home when a lane owns the file").
// This shim keeps the S4 import sites (`phenology/labels.ts`, NoteDetail) valid.

export { cmToInches, formatShootLength, formatShootLengthRange } from "@/lib/units/display";
