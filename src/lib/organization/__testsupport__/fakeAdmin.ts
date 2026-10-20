// Test-only in-memory stand-in for the Supabase admin client (2026-10-21).
// Supports exactly the query shapes the contributor/vendor boundary code
// uses (select/eq/in/order/limit/maybeSingle/single, awaited lists) and
// RECORDS every write attempt (insert/update/upsert/delete) in `ops`, so
// negative tests can assert that a refused action wrote nothing at all.
// Contains no vitest import on purpose — it is plain data/logic.

export type FakeRow = Record<string, unknown>;
export type FakeTables = Record<string, FakeRow[]>;
export type FakeWrite = { table: string; kind: "insert" | "update" | "upsert" | "delete"; payload?: unknown };

export function makeFakeAdmin(tables: FakeTables) {
  const ops: FakeWrite[] = [];

  function from(table: string) {
    const filters: [string, unknown][] = [];
    let writeKind: FakeWrite["kind"] | null = null;
    const rows = () => (tables[table] ?? []).filter((row) => filters.every(([col, val]) => row[col] === val));

    const result = (data: unknown) => ({ data, error: null as null | { message: string; code?: string } });
    const builder: Record<string, unknown> = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push([col, vals[0]]);
        return builder;
      },
      not() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      insert(payload: unknown) {
        ops.push({ table, kind: "insert", payload });
        writeKind = "insert";
        return builder;
      },
      update(payload: unknown) {
        ops.push({ table, kind: "update", payload });
        writeKind = "update";
        return builder;
      },
      upsert(payload: unknown) {
        ops.push({ table, kind: "upsert", payload });
        writeKind = "upsert";
        return builder;
      },
      delete() {
        ops.push({ table, kind: "delete" });
        writeKind = "delete";
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(result(writeKind ? null : (rows()[0] ?? null)));
      },
      single() {
        const found = rows()[0] ?? null;
        return Promise.resolve(found || writeKind ? result(found) : { data: null, error: { message: "not found" } });
      },
      then(onFulfilled: (value: ReturnType<typeof result>) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(result(writeKind ? null : rows())).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return { client: { from }, ops };
}
