// DEVELOPMENT CREDENTIALS MUST NEVER REACH PRODUCTION (and a production build must never point at a lab database). Pure, import-free.
// Lab API keys are minted by the kit's renew_lab_keys.sh with a marker claim (ordift_env = "lab"). The marker is read WITHOUT verifying the signature (it is only a label; the signature check is done by the database).
//   1. a key marked "lab" is refused unless the project URL is a local address (so a lab key pasted next to a real project URL fails at once, before any request is made);
//   2. a key with no marker is accepted anywhere (real project keys), BUT a production deployment (SITE_ENV=production) is refused when its URL is a local address (a lab database behind a production site);
//   3. a lab-marked key in a production deployment is always refused.
// Independently of this guard a lab key cannot work against a real project at all: the real project verifies JWTs with its OWN secret, and the lab's secret never leaves the lab database container.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "host.docker.internal"]);
export const isLocalUrl = (url: string | undefined): boolean => { try { return LOCAL_HOSTS.has(new URL(String(url)).hostname) || /\.localhost$/.test(new URL(String(url)).hostname); } catch { return false; } };
export function keyMarker(key: string | undefined): string | null {
  try { const body = String(key).split(".")[1]; if (!body) return null; const p = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); return typeof p.ordift_env === "string" ? p.ordift_env : null; } catch { return null; }
}
export function checkSupabaseEnvironment(env: { url: string | undefined; key: string | undefined; siteEnv: string | undefined }): { ok: true } | { ok: false; error: string } {
  const lab = keyMarker(env.key) === "lab", local = isLocalUrl(env.url), production = env.siteEnv === "production";
  if (lab && production) return { ok: false, error: "A development (lab) API key is configured in a production deployment. Refusing to start." };
  if (lab && !local) return { ok: false, error: "A development (lab) API key is paired with a non-local project URL. Refusing: lab keys only ever talk to the local lab database." };
  if (production && local) return { ok: false, error: "A production deployment points at a local database address. Refusing to start." };
  return { ok: true };
}
export function assertSupabaseEnvironment(env: { url: string | undefined; key: string | undefined; siteEnv?: string | undefined } = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY, siteEnv: process.env.SITE_ENV }): void {
  const r = checkSupabaseEnvironment({ url: env.url, key: env.key, siteEnv: env.siteEnv });
  if (!r.ok) throw new Error(`[environment] ${r.error}`);
}
