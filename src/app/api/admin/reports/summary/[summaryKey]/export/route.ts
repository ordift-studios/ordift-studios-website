import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/apiAuth";
import { getSummaryReportModule } from "@/lib/admin/reports/summaryModules";
import { rowsToCsv } from "@/lib/admin/reports/csv";
import { rowsToXlsxBuffer } from "@/lib/admin/reports/xlsx";

export async function GET(
  request: NextRequest,
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

  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const rows = await summaryModule.fetchRows();
  const datestamp = new Date().toISOString().slice(0, 10);
  const baseFilename = `${summaryModule.key}-${datestamp}`;

  if (format === "xlsx") {
    const buffer = await rowsToXlsxBuffer(summaryModule.label, summaryModule.columns, rows);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseFilename}.xlsx"`,
      },
    });
  }

  const csv = rowsToCsv(summaryModule.columns, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseFilename}.csv"`,
    },
  });
}
