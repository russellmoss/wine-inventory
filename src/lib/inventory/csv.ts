import type { ItemKind } from "@/lib/stock/movements";

/**
 * Bulk CSV inventory import — pure parsing + validation.
 *
 * Expected columns (case-insensitive, order-independent):
 *   Item, Vintage, Category, Location, Quantity
 *
 * - "Wine" (case-insensitive) categories map to BOTTLED_WINE and require a vintage.
 *   The vintage comes from the Vintage column, or — to keep the user's existing
 *   spreadsheets working — is parsed from a single 4-digit year in the Item text
 *   (e.g. "2024 Chateau Bon Vivant" -> name "Chateau Bon Vivant", vintage 2024).
 * - Any other category maps to FINISHED_GOOD and ignores vintage.
 *
 * No DB access here. This is the unit-tested core.
 */

export type ParsedInventoryRow = {
  lineNo: number; // 1-based source line (header is line 1)
  kind: ItemKind;
  name: string;
  vintage: number | null; // set for BOTTLED_WINE, null for FINISHED_GOOD
  category: string;
  location: string;
  qty: number;
};

export type RowError = { lineNo: number; message: string };

export type ParseResult = { rows: ParsedInventoryRow[]; errors: RowError[] };

export const MAX_IMPORT_ROWS = 2000;

// Mirror the inventory action's vintage bounds (parseVintage in actions.ts).
const VINTAGE_MIN = 1900;
const VINTAGE_MAX = 2027;
const INT32_MAX = 2147483647;

const REQUIRED_HEADERS = ["item", "category", "location", "quantity"] as const;

/** Split a single CSV line into fields, honoring double-quoted cells ("" escapes a quote). */
function splitFields(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Tokenize the whole document into records. Handles quoted fields that contain
 * commas or newlines, and normalizes CRLF / CR / LF line endings.
 */
function toRecords(text: string): string[][] {
  // Strip a leading UTF-8 BOM if present (Excel / Google Sheets add one).
  const clean = text.replace(/^﻿/, "");
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let sawAny = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
    sawAny = false;
  };

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
      sawAny = true;
    } else if (ch === ",") {
      pushField();
      sawAny = true;
    } else if (ch === "\r") {
      if (clean[i + 1] === "\n") i++;
      pushRecord();
    } else if (ch === "\n") {
      pushRecord();
    } else {
      field += ch;
      if (ch.trim() !== "") sawAny = true;
    }
  }
  // Trailing record (file may not end with a newline).
  if (field !== "" || record.length > 0 || sawAny) pushRecord();
  return records;
}

function isBlankRecord(fields: string[]): boolean {
  return fields.every((f) => f.trim() === "");
}

/** Find a single standalone 4-digit year (1900..2027) in a string. Returns null if 0 or >1. */
function extractYear(text: string): number | null {
  const matches = text.match(/\b\d{4}\b/g);
  if (!matches) return null;
  const years = matches.map(Number).filter((n) => n >= VINTAGE_MIN && n <= VINTAGE_MAX);
  if (years.length !== 1) return null;
  return years[0];
}

function stripYear(text: string, year: number): string {
  return text
    .replace(new RegExp(`\\b${year}\\b`), "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function parseInventoryCsv(text: string): ParseResult {
  const records = toRecords(text);
  const rows: ParsedInventoryRow[] = [];
  const errors: RowError[] = [];

  if (records.length === 0 || records.every(isBlankRecord)) {
    return { rows, errors: [{ lineNo: 1, message: "The file is empty." }] };
  }

  // Header is the first non-blank record.
  let headerIdx = 0;
  while (headerIdx < records.length && isBlankRecord(records[headerIdx])) headerIdx++;
  const header = records[headerIdx].map((h) => h.trim().toLowerCase());

  const col: Record<string, number> = {};
  header.forEach((h, i) => {
    if (!(h in col)) col[h] = i; // first occurrence wins
  });

  const missing = REQUIRED_HEADERS.filter((h) => !(h in col));
  if (missing.length > 0) {
    return {
      rows,
      errors: [
        {
          lineNo: headerIdx + 1,
          message: `Missing required column(s): ${missing.join(", ")}. Expected headers: Item, Vintage, Category, Location, Quantity.`,
        },
      ],
    };
  }

  const dataRecords = records.slice(headerIdx + 1);
  let dataCount = 0;

  for (let r = 0; r < dataRecords.length; r++) {
    const fields = dataRecords[r];
    const lineNo = headerIdx + 1 + (r + 1); // 1-based source line
    if (isBlankRecord(fields)) continue;

    dataCount++;
    if (dataCount > MAX_IMPORT_ROWS) {
      errors.push({ lineNo, message: `Too many rows. Limit is ${MAX_IMPORT_ROWS} per upload.` });
      break;
    }

    const cell = (key: string): string => (col[key] != null ? (fields[col[key]] ?? "").trim() : "");

    const itemRaw = cell("item");
    const category = cell("category");
    const location = cell("location");
    const qtyRaw = cell("quantity");
    const vintageRaw = cell("vintage");

    const rowErrors: string[] = [];
    if (!itemRaw) rowErrors.push("Item is required");
    if (!category) rowErrors.push("Category is required");
    if (!location) rowErrors.push("Location is required");

    const qty = Number(qtyRaw);
    if (!qtyRaw || !Number.isInteger(qty) || qty <= 0 || qty > INT32_MAX) {
      rowErrors.push("Quantity must be a whole number greater than 0");
    }

    const isWine = category.toLowerCase() === "wine";
    let name = itemRaw;
    let vintage: number | null = null;

    if (isWine) {
      if (vintageRaw) {
        const v = Number(vintageRaw);
        if (!Number.isInteger(v) || v < VINTAGE_MIN || v > VINTAGE_MAX) {
          rowErrors.push(`Vintage must be a year between ${VINTAGE_MIN} and ${VINTAGE_MAX}`);
        } else {
          vintage = v;
        }
      } else {
        const fromName = extractYear(itemRaw);
        if (fromName == null) {
          rowErrors.push("Wine rows need a vintage (add a Vintage column or put the year in the item name)");
        } else {
          vintage = fromName;
          name = stripYear(itemRaw, fromName) || itemRaw;
        }
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ lineNo, message: rowErrors.join("; ") });
      continue;
    }

    rows.push({
      lineNo,
      kind: isWine ? "BOTTLED_WINE" : "FINISHED_GOOD",
      name,
      vintage,
      category,
      location,
      qty,
    });
  }

  return { rows, errors };
}
