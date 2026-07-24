import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Component / Route Handler client — reads the visitor's session
// from cookies. Uses the publishable key + RLS, same as the browser
// client; this is "me, as the logged-in user," not an admin client.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component that can't set cookies
            // (no request/response to attach to) — safe to ignore as
            // long as proxy.ts refreshes the session on every request.
          }
        },
      },
    }
  );
}
