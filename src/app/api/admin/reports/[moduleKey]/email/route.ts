import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/apiAuth";
import { getReportModule } from "@/lib/admin/reports/registry";
import { rowsToXlsxBuffer } from "@/lib/admin/reports/xlsx";
import { sendReportEmail } from "@/lib/admin/reports/sendReportEmail";
import type { ReportFilters } from "@/lib/admin/reports/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ moduleKey: string }> }
) {
  const user = await requireAdminApiUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { moduleKey } = await params;
  const reportModule = getReportModule(moduleKey);
  if (!reportModule) {
    return NextResponse.json({ ok: false, error: "unknown-report" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const filters = (body as { filters?: ReportFilters }).filters ?? {};

  const rows = await reportModule.fetchRows(filters);
  const datestamp = new Date().toISOString().slice(0, 10);
  const buffer = await rowsToXlsxBuffer(reportModule.label, reportModule.columns, rows);

  const result = await sendReportEmail({
    subject: `${reportModule.label} Report — ${datestamp}`,
    bodyText: `Attached: ${reportModule.label} report generated ${datestamp}, ${rows.length} record${
      rows.length === 1 ? "" : "s"
    }. Sent on demand by ${user.fullName ?? user.email} from the Ordift Studios Admin Portal.`,
    filename: `${reportModule.key}-${datestamp}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    attachment: buffer,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503 });
  }

  return NextResponse.json({ ok: true, mode: result.mode, recordCount: rows.length });
}
