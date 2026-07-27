import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/apiAuth";
import { getSummaryReportModule } from "@/lib/admin/reports/summaryModules";
import { rowsToXlsxBuffer } from "@/lib/admin/reports/xlsx";
import { sendReportEmail } from "@/lib/admin/reports/sendReportEmail";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ summaryKey: string }> }
) {
  const user = await requireAdminApiUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { summaryKey } = await params;
  const summaryModule = getSummaryReportModule(summaryKey);
  if (!summaryModule) {
    return NextResponse.json({ ok: false, error: "unknown-report" }, { status: 404 });
  }

  const rows = await summaryModule.fetchRows();
  const datestamp = new Date().toISOString().slice(0, 10);
  const buffer = await rowsToXlsxBuffer(summaryModule.label, summaryModule.columns, rows);

  const result = await sendReportEmail({
    subject: `${summaryModule.label} — ${datestamp}`,
    bodyText: `Attached: ${summaryModule.label}, generated ${datestamp}. Sent on demand by ${
      user.fullName ?? user.email
    } from the Ordift Studios Admin Portal.`,
    filename: `${summaryModule.key}-${datestamp}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    attachment: buffer,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503 });
  }

  return NextResponse.json({ ok: true, mode: result.mode });
}
