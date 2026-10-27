// Minimal in-memory stand-in for the Supabase admin client, for unit tests of server-side registry actions. Supports the call shapes the
// legal-registry code uses: select/eq/in/is/ilike/order/limit/maybeSingle/single, insert, update (with the same filters), and storage.download.
type Row = Record<string, unknown>;
export type FakeDb = { tables: Record<string, Row[]>; storage: Record<string, Uint8Array>; failInsert?: Set<string>; rpcHandlers?: Record<string, (args: Record<string, unknown>, db: FakeDb) => { data: unknown; error: { message: string; code?: string } | null }>; writes: { table: string; op: "insert" | "update"; values: Row; matched?: number }[] };

export function makeFakeDb(tables: Record<string, Row[]> = {}, storage: Record<string, Uint8Array> = {}): FakeDb {
  return { tables: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.map((r) => ({ ...r }))])), storage, writes: [] };
}

export function fakeAdmin(db: FakeDb) {
  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let lim: number | null = null;
    let mode: "select" | "insert" | "update" = "select";
    let payload: Row = {};
    const rows = () => (db.tables[table] ??= []);
    const matched = () => {
      let r = rows().filter((x) => filters.every((f) => f(x)));
      if (orderBy) r = [...r].sort((a, b) => String(a[orderBy!.col]).localeCompare(String(b[orderBy!.col])) * (orderBy!.asc ? 1 : -1));
      return lim == null ? r : r.slice(0, lim);
    };
    const run = () => {
      if (mode === "insert" && db.failInsert?.has(table)) return { data: null, error: { message: "simulated write failure" } };
      if (mode === "insert") {
        const made: Row[] = [];
        for (const one of Array.isArray(payload) ? (payload as Row[]) : [payload]) { // supabase-js accepts one row or an array of rows
          const row: Row = { id: one.id ?? `${table}-${rows().length + 1}`, ...one };
          if (!row.created_at) row.created_at = new Date(Date.UTC(2026, 9, 30, 10, 0, rows().length)).toISOString(); rows().push(row); made.push(row);
        }
        db.writes.push({ table, op: "insert", values: payload }); return { data: made, error: null };
      }
      if (mode === "update") { const m = matched(); m.forEach((r) => Object.assign(r, payload)); db.writes.push({ table, op: "update", values: payload, matched: m.length }); return { data: m, error: null }; }
      return { data: matched(), error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (v: Row) => { mode = "insert"; payload = v; return b; },
      update: (v: Row) => { mode = "update"; payload = v; return b; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
      like: (c: string, pat: string) => { const pre = pat.replace(/%$/, ""); filters.push((r) => String(r[c] ?? "").startsWith(pre)); return b; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b; },
      ilike: (c: string, v: string) => { filters.push((r) => String(r[c] ?? "").toLowerCase() === v.toLowerCase()); return b; },
      order: (col: string, o?: { ascending?: boolean }) => { orderBy = { col, asc: o?.ascending !== false }; return b; },
      limit: (n: number) => { lim = n; return b; },
      maybeSingle: () => { const r = run(); return Promise.resolve({ data: (r.data as Row[])[0] ?? null, error: null }); },
      single: () => { const r = run(); const row = (r.data as Row[] | null)?.[0] ?? null; return Promise.resolve({ data: row, error: row ? null : ((r as { error?: unknown }).error ?? { message: "no row" }) }); },
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return b;
  }
  return {
    from,
    storage: { from: () => ({ download: async (path: string) => (db.storage[path] ? { data: new Blob([db.storage[path] as BlobPart]), error: null } : { data: null, error: { message: "missing" } }), upload: async (path: string, body: Buffer) => { if (db.storage[path]) return { error: { message: "exists" } }; db.storage[path] = new Uint8Array(body); return { error: null }; } }) },
    rpc: async (name: string, args: Record<string, unknown>) => (db.rpcHandlers?.[name] ? db.rpcHandlers[name](args, db) : { data: null, error: { message: `no rpc ${name}` } }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "kwaku@example.test" } } }) } },
  };
}
