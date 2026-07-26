/**
 * Spray S2 Unit 3 — streaming xlsx → row objects for the APPRIL dump. Lives in scripts/ (vercelignored)
 * so the reader never enters the Next bundle (K9). Importable module, no main() — the ingest script
 * and tests import it.
 *
 * Why not exceljs: measured 2026-07-26 — its streaming WorkbookReader (unzipper's streaming Parse)
 * fails on this zip's data-descriptor entries with "invalid signature". The dump's sharedStrings.xml
 * is 138 bytes (the sheet uses INLINE strings), so the plan's fallback — open the zip's central
 * directory, stream the sheet entry, SAX-parse — is the primary path: 366,591 rows in ~15 s at
 * ~134 MB peak RSS, constant memory.
 */

import { createRequire } from "node:module";
import { SaxesParser } from "saxes";

// unzipper is CJS; createRequire keeps tsx/ESM interop deterministic.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const unzipper = require("unzipper") as typeof import("unzipper");

/** "AB12" → 27 (0-based column index). */
function colIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
    else break;
  }
  return n - 1;
}

/**
 * Stream every data row of the first worksheet as a header-keyed record. The first row is the header.
 * Backpressure: the zip stream is paused while a chunk's completed rows are awaited, so an async
 * `onRow` (e.g. batched DB writes) bounds memory to one chunk's rows.
 */
export async function streamSheetRows(
  xlsxPath: string,
  onRow: (row: Record<string, string>, rowIndex: number) => void | Promise<void>,
  opts?: { sheetPath?: string; maxRows?: number },
): Promise<{ rows: number }> {
  const sheetPath = opts?.sheetPath ?? "xl/worksheets/sheet1.xml";
  const dir = await unzipper.Open.file(xlsxPath);
  const entry = dir.files.find((f) => f.path === sheetPath);
  if (!entry) throw new Error(`xlsx-stream: entry ${sheetPath} not found in ${xlsxPath}`);

  const parser = new SaxesParser();
  let header: string[] | null = null;
  let rowCount = 0;
  let curRow: string[] | null = null;
  let curCol = -1;
  let capture = false;
  let text = "";
  let stopped = false;
  const completed: Record<string, string>[] = [];

  parser.on("opentag", (tag) => {
    if (tag.name === "row") curRow = [];
    else if (tag.name === "c") curCol = colIndex(String(tag.attributes.r ?? ""));
    else if (tag.name === "v" || tag.name === "t") {
      capture = true;
      text = "";
    }
  });
  parser.on("text", (t) => {
    if (capture) text += t;
  });
  parser.on("closetag", (tag) => {
    if ((tag.name === "v" || tag.name === "t") && capture) {
      capture = false;
      if (curRow && curCol >= 0) curRow[curCol] = (curRow[curCol] ?? "") + text;
    } else if (tag.name === "row" && curRow) {
      if (!header) {
        header = curRow.map((v) => String(v ?? ""));
      } else {
        const obj: Record<string, string> = {};
        header.forEach((h, i) => (obj[h] = curRow![i] ?? ""));
        completed.push(obj);
      }
      curRow = null;
    }
  });

  await new Promise<void>((resolve, reject) => {
    const stream = entry.stream();
    stream.on("data", (chunk: Buffer) => {
      if (stopped) return;
      stream.pause();
      try {
        parser.write(chunk.toString("utf8"));
      } catch (err) {
        reject(err);
        return;
      }
      const drain = async () => {
        while (completed.length > 0) {
          const row = completed.shift()!;
          rowCount++;
          await onRow(row, rowCount);
          if (opts?.maxRows != null && rowCount >= opts.maxRows) {
            stopped = true;
            stream.destroy();
            resolve();
            return;
          }
        }
        stream.resume();
      };
      drain().catch(reject);
    });
    stream.on("end", () => {
      try {
        parser.close();
      } catch {
        // saxes close on a truncated tail — the rows already emitted stand
      }
      const drain = async () => {
        while (completed.length > 0) {
          const row = completed.shift()!;
          rowCount++;
          await onRow(row, rowCount);
        }
        resolve();
      };
      drain().catch(reject);
    });
    stream.on("error", (err: Error) => {
      if (!stopped) reject(err);
    });
  });

  return { rows: rowCount };
}
