import { createBrowserClient } from "@supabase/ssr";

// Browser-side client — uses the publishable key (this project's new-
// system replacement for the legacy anon key), safe to expose. RLS
// governs what it can actually read/write, see supabase/migrations/.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
