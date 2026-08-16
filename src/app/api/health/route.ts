import { NextResponse } from "next/server";

// TD-013 — minimal external uptime-monitoring target. Deliberately does
// not touch Supabase/Sanity/Resend or any other downstream service, and
// never returns anything beyond a static status — see
// TECHNICAL_DEBT_REGISTER.md TD-013.
export async function GET() {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
