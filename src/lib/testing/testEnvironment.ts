import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Config-injection point for integration tests — see
// INTEGRATION_TESTING_STRATEGY.md §7 and ENGINEERING_GUIDE.md's
// Environment Configuration section for the full reasoning. Every
// value here is resolved from environment variables, never hardcoded,
// so redirecting the whole integration-test suite at a future
// dedicated ephemeral environment is a config change, not a rewrite.
//
// Today, no TEST_-prefixed vars are set anywhere — every value falls
// back to the same staging credentials the app itself already uses
// locally (.env.local, SITE_ENV=staging), per the approved hybrid
// model: reuse staging now, inject a different target later without
// touching a single test file.

function requireEnv(testVar: string, fallbackVar: string): string {
  const value = process.env[testVar] ?? process.env[fallbackVar];
  if (!value) {
    throw new Error(
      `[testEnvironment] Missing ${testVar} (and fallback ${fallbackVar}). ` +
        `Integration tests need staging Supabase credentials — see INTEGRATION_TESTING_STRATEGY.md §6.`
    );
  }
  return value;
}

export function getTestSupabaseUrl(): string {
  return requireEnv("TEST_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
}

function getTestSupabaseAnonKey(): string {
  return requireEnv("TEST_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

function getTestSupabaseServiceRoleKey(): string {
  return requireEnv("TEST_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
}

// Bypasses RLS — used only for fixture setup/teardown (creating and
// deleting test users), never for the actual assertions being tested.
// See INTEGRATION_TESTING_STRATEGY.md §5.
export function createTestAdminClient(): SupabaseClient {
  return createClient(getTestSupabaseUrl(), getTestSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// A fresh anon-key client, to be signed in as a specific test user via
// setSession/signInWithPassword — this is the client RLS assertions
// actually run through, so the real policy is exercised, not bypassed.
export function createTestAnonClient(): SupabaseClient {
  return createClient(getTestSupabaseUrl(), getTestSupabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Every resource an integration test creates carries this prefix in a
// human-legible field (email, name, etc.) — see
// INTEGRATION_TESTING_STRATEGY.md §3. `.invalid` is the RFC 2606
// reserved TLD for addresses that must never resolve or receive real
// mail, as a second line of defense alongside admin.createUser's
// email_confirm bypass (§2 of the strategy doc).
export function testRunId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function testEmail(label: string, runId: string): string {
  return `test-${label}-${runId}@ordiftstudios.invalid`;
}
