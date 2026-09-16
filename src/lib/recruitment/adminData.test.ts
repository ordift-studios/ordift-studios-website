import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Regression coverage for the recruitment_applications Save Status
// defect (2026-09-16): 0036 attached the standard
// `<table>_set_updated_at` trigger (public.set_updated_at(), which sets
// `new.updated_at = now()`) without ever adding an `updated_at` column
// to the table, so every UPDATE failed Production-wide. Fixed by
// 0132_recruitment_applications_updated_at.sql.
//
// This doc-test doesn't just re-assert that one fix — it scans every
// migration for the same class of mistake: any table with a
// `_set_updated_at` trigger must also declare an `updated_at` column
// somewhere in the migration history (the CREATE TABLE, or a later
// ALTER TABLE ADD COLUMN), so this specific defect can't recur silently
// on a different table.
describe("schema invariant — every *_set_updated_at trigger has a matching updated_at column", () => {
  const migrationsDir = join(process.cwd(), "supabase/migrations");
  const allSql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
    .join("\n");

  // A table's `updated_at` column may be declared in its CREATE TABLE,
  // or added later by any ALTER TABLE ... ADD COLUMN [IF NOT EXISTS]
  // clause anywhere in that table's own multi-column ALTER statement —
  // so this checks the whole statement body, not just the text
  // immediately after the table name.
  function tableDeclaresUpdatedAt(table: string): boolean {
    const createTableMatch = allSql.match(new RegExp(`create table public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`));
    if (createTableMatch && /\bupdated_at\b/.test(createTableMatch[1])) return true;

    const alterRegex = new RegExp(`alter table public\\.${table}\\b[\\s\\S]*?;`, "gi");
    let alterMatch: RegExpExecArray | null;
    while ((alterMatch = alterRegex.exec(allSql))) {
      if (/add column\s+(if not exists\s+)?updated_at\b/i.test(alterMatch[0])) return true;
    }
    return false;
  }

  it("recruitment_applications now has updated_at (defect fixed)", () => {
    expect(tableDeclaresUpdatedAt("recruitment_applications")).toBe(true);
  });

  it("every table with a *_set_updated_at trigger declares updated_at somewhere", () => {
    const triggerTables = new Set<string>();
    const triggerRegex = /create trigger \S+_set_updated_at\s+before update on public\.(\w+)/gi;
    let match: RegExpExecArray | null;
    while ((match = triggerRegex.exec(allSql))) {
      triggerTables.add(match[1]);
    }
    expect(triggerTables.size).toBeGreaterThan(0);

    const missing = [...triggerTables].filter((table) => !tableDeclaresUpdatedAt(table));
    expect(missing).toEqual([]);
  });
});
