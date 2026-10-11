import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/portal/roles";
import { canVerifyBankTransfers } from "@/lib/payments/bankTransferAccess";
import { createProofViewUrl } from "@/lib/payments/bankTransferVerification";

// Opens a client's proof of payment through a short-lived signed link. Authenticated, authorised
// (Super Admin or the explicit finance.bank_transfer.verify grant — not any admin) and audited on
// every view. The bucket stays private.
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user || !(await canVerifyBankTransfers(user.id))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }
  const result = await createProofViewUrl({ paymentId: id, viewerId: user.id });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  const response = NextResponse.redirect(result.url, 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
