import writeXlsxFile from "write-excel-file/node";
import type { ReportRow } from "./types";

// Clean, print/archive-suitable formatting: a bold navy header row
// frozen at the top (stickyRowsCount), sensible per-column widths
// derived from the header/content length, and landscape orientation —
// operational reports are usually wider than they are tall. Kept
// intentionally simple (no per-column type inference, no conditional
// formatting) since the goal is a document someone opens, reads, or
// prints, not a spreadsheet meant to be recalculated.
export async function rowsToXlsxBuffer(
  sheetName: string,
  columns: string[],
  rows: ReportRow[]
): Promise<Buffer> {
  const headerRow = columns.map((col) => ({
    value: col,
    type: String,
    fontWeight: "bold" as const,
    backgroundColor: "#0B1220",
    textColor: "#FFFFFF",
    align: "left" as const,
  }));

  const dataRows = rows.map((row) =>
    columns.map((col) => {
      const cell = row[col];
      return {
        value: cell === null || cell === undefined ? "" : String(cell),
        type: String,
        align: "left" as const,
      };
    })
  );

  const widths = columns.map((col) => {
    const longestValue = rows.reduce((max, row) => {
      const cell = row[col];
      const len = cell === null || cell === undefined ? 0 : String(cell).length;
      return Math.max(max, len);
    }, col.length);
    return { width: Math.min(Math.max(longestValue + 2, 12), 48) };
  });

  // Excel sheet names have a hard 31-character limit.
  const result = await writeXlsxFile([headerRow, ...dataRows], {
    sheet: sheetName.slice(0, 31),
    columns: widths,
    stickyRowsCount: 1,
    orientation: "landscape",
  });

  return result.toBuffer();
}
