import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/apiAuth";
import { getReportModule } from "@/lib/admin/reports/registry";
import { rowsToCsv } from "@/lib/admin/reports/csv";
import { rowsToXlsxBuffer } from "@/lib/admin/reports/xlsx";
import type { ReportFilters } from "@/lib/admin/reports/types";

function filtersFromSearchParams(searchParams: URLSearchParams): ReportFilters {
  return {
    search: searchParams.get("search") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    paymentStatus: searchParams.get("paymentStatus") ?? undefined,
    workshopOrService: searchParams.get("workshopOrService") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
  };
}

export async function GET(
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

  const searchParams = request.nextUrl.searchParams;
  const format = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const filters = filtersFromSearchParams(searchParams);

  const rows = await reportModule.fetchRows(filters);
  const datestamp = new Date().toISOString().slice(0, 10);
  const baseFilename = `${reportModule.key}-${datestamp}`;

  if (format === "xlsx") {
    const buffer = await rowsToXlsxBuffer(reportModule.label, reportModule.columns, rows);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseFilename}.xlsx"`,
      },
    });
  }

  const csv = rowsToCsv(reportModule.columns, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseFilename}.csv"`,
    },
  });
}
