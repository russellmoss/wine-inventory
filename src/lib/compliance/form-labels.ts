import type { WineTaxClass } from "./types";

// Human labels for the §A/§B grid, mirroring the TTB F 5120.17 line names. Pure — shared by the
// review screen. Only the lines v1 renders/uses are labeled; blanks (10/11, 24–28, 5/6, 15–17) are
// spacers on the form and omitted here.

export const TAX_CLASS_COLUMNS: { key: WineTaxClass; letter: string; header: string; band: string }[] = [
  { key: "A_LE16", letter: "a", header: "Not over 16%", band: "≤16% ABV" },
  { key: "B_16_21", letter: "b", header: "Over 16 to 21%", band: ">16–21%" },
  { key: "C_21_24", letter: "c", header: "Over 21 to 24%", band: ">21–24%" },
  { key: "D_CARBONATED", letter: "d", header: "Artificially carbonated", band: "carbonated" },
  { key: "E_SPARKLING", letter: "e", header: "Sparkling", band: "BF / BP" },
  { key: "F_HARD_CIDER", letter: "f", header: "Hard cider", band: "cider" },
];

export const SECTION_A_LINES: { line: number; label: string; kind: "begin" | "add" | "remove" | "end" | "total" }[] = [
  { line: 1, label: "On hand beginning of period", kind: "begin" },
  { line: 2, label: "Produced by fermentation", kind: "add" },
  { line: 3, label: "Produced by sweetening", kind: "add" },
  { line: 4, label: "Produced by addition of wine spirits", kind: "add" },
  { line: 5, label: "Produced by blending", kind: "add" },
  { line: 6, label: "Produced by amelioration", kind: "add" },
  { line: 7, label: "Received in bond", kind: "add" },
  { line: 8, label: "Bottled wine dumped to bulk", kind: "add" },
  { line: 9, label: "Inventory gains", kind: "add" },
  { line: 12, label: "TOTAL", kind: "total" },
  { line: 13, label: "Bottled", kind: "remove" },
  { line: 14, label: "Removed taxpaid", kind: "remove" },
  { line: 15, label: "Transfers in bond", kind: "remove" },
  { line: 16, label: "Removed for distilling material", kind: "remove" },
  { line: 17, label: "Removed to vinegar plant", kind: "remove" },
  { line: 18, label: "Used for sweetening", kind: "remove" },
  { line: 19, label: "Used for addition of wine spirits", kind: "remove" },
  { line: 20, label: "Used for blending", kind: "remove" },
  { line: 21, label: "Used for amelioration", kind: "remove" },
  { line: 22, label: "Used for effervescent wine", kind: "remove" },
  { line: 23, label: "Used for testing", kind: "remove" },
  { line: 29, label: "Losses (other than inventory)", kind: "remove" },
  { line: 30, label: "Inventory losses", kind: "remove" },
  { line: 31, label: "On hand end of period", kind: "end" },
  { line: 32, label: "TOTAL", kind: "total" },
];

export const SECTION_B_LINES: { line: number; label: string; kind: "begin" | "add" | "remove" | "end" | "total" }[] = [
  { line: 1, label: "On hand beginning of period", kind: "begin" },
  { line: 2, label: "Bottled", kind: "add" },
  { line: 3, label: "Received in bond", kind: "add" },
  { line: 4, label: "Taxpaid wine returned to bond", kind: "add" },
  { line: 7, label: "TOTAL", kind: "total" },
  { line: 8, label: "Removed taxpaid", kind: "remove" },
  { line: 9, label: "Transferred in bond", kind: "remove" },
  { line: 10, label: "Dumped to bulk", kind: "remove" },
  { line: 11, label: "Used for tasting", kind: "remove" },
  { line: 12, label: "Removed for export", kind: "remove" },
  { line: 13, label: "Removed for family use", kind: "remove" },
  { line: 14, label: "Used for testing", kind: "remove" },
  { line: 18, label: "Breakage", kind: "remove" },
  { line: 19, label: "Inventory shortage", kind: "remove" },
  { line: 20, label: "On hand end of period", kind: "end" },
  { line: 21, label: "TOTAL", kind: "total" },
];
