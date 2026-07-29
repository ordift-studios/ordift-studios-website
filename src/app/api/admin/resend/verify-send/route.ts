import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireSuperAdminApiUser } from "@/lib/admin/apiAuth";

// Super Admin-only, one-shot verification action — same precedent as
// /api/admin/google-sheets/verify-write. Proves the production
// RESEND_API_KEY actually authenticates and sends by calling Resend
// directly from inside the running deployment, the only place that can
// read a Vercel "Sensitive" environment variable's real value — the
// CLI/dashboard/`vercel env pull` cannot, by design, which is why this
// route exists instead of checking the key from outside the app.
//
// Deliberately bypasses productionSendingEnabled()/FORMS_SENDING_ENABLED
// on purpose: this route's whole point is testing the credential itself
// on demand, independent of whether public-form sending is turned on
// yet — it is never called from any visitor-facing path.
export async function POST() {
  const user = await requireSuperAdminApiUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;
  const to = process.env.EMAIL_ADMIN_NOTIFICATION_TO;

  if (!apiKey || !from || !to) {
    return NextResponse.json(
      {
        ok: false,
        error: "not-configured",
        detail: {
          RESEND_API_KEY: Boolean(apiKey),
          EMAIL_FROM_ADDRESS: Boolean(from),
          EMAIL_ADMIN_NOTIFICATION_TO: Boolean(to),
        },
      },
      { status: 503 }
    );
  }

  const now = new Date().toISOString();
  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to,
      subject: "Ordift Studios — Resend production verification (safe to ignore)",
      text: `Verification send triggered by ${user.email} at ${now} via /api/admin/resend/verify-send. Confirms RESEND_API_KEY authenticates and the send path works. No action needed.`,
    });

    if (result.error) {
      return NextResponse.json(
        { ok: false, error: "resend-rejected", detail: result.error, verifiedBy: user.email, verifiedAt: now },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, resendId: result.data?.id, verifiedBy: user.email, verifiedAt: now });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "send-failed", detail: err instanceof Error ? err.message : "unknown-error" },
      { status: 500 }
    );
  }
}
