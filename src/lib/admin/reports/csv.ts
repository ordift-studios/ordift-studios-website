import type { ReportRow } from "./types";

// RFC 4180-ish: a field is quoted whenever it contains a comma, quote,
// or newline; embedded quotes are doubled. Good enough for Excel/Sheets/
// Numbers to round-trip correctly, without pulling in a CSV library for
// something this small.
function escapeCsvField(value: string | number | null): string {
  const str = value === null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(columns: string[], rows: ReportRow[]): string {
  const lines = [columns.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCsvField(row[col] ?? "")).join(","));
  }
  // \r\n line endings — the conventional CSV terminator, and what
  // Excel expects to avoid treating the whole file as one line on
  // Windows.
  return lines.join("\r\n") + "\r\n";
}
