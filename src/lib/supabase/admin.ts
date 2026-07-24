import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Secret-key client — bypasses RLS entirely (this project's new-system
// replacement for the legacy service_role key, same privilege level).
// Server-only, never imported by a Client Component. Used for: (1) the
// enquiry/workshop registration API routes' dual-write into Supabase
// (the visitor submitting isn't necessarily logged in, so there's no
// user session to write under), and (2) admin operations (role
// assignment) that need to read/write across every user's data.
// SUPABASE_SECRET_KEY must never be prefixed NEXT_PUBLIC_ and must never
// reach the browser bundle — same handling as every other server secret
// in this project (GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, SANITY_API_TOKEN,
// etc.).
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
