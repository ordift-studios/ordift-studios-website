"use server";

import { redirect } from "next/navigation";
import { requireAdminApiUser } from "@/lib/admin/apiAuth";
import { getReportModule } from "@/lib/admin/reports/registry";
import { getSummaryReportModule } from "@/lib/admin/reports/summaryModules";
import { rowsToXlsxBuffer } from "@/lib/admin/reports/xlsx";
import { sendReportEmail } from "@/lib/admin/reports/sendReportEmail";
import type { ReportRow } from "@/lib/admin/reports/types";
import { logActivity } from "@/lib/admin/activityLog";

// Plain <form action={...}> submission, no client JS — same pattern as
// src/app/portal/login/actions.ts's signOutAction. Redirects back to
// /admin/reports with a one-time `sent`/`error` query param so the page
// can show a confirmation banner without needing client-side state.
export async function emailReportAction(formData: FormData): Promise<void> {
  const user = await requireAdminApiUser();
  if (!user) redirect("/admin/reports?error=unauthorized");

  const kind = String(formData.get("kind") ?? "module");
  const key = String(formData.get("key") ?? "");
  const dateFrom = String(formData.get("dateFrom") ?? "") || undefined;
  const dateTo = String(formData.get("dateTo") ?? "") || undefined;

  let rows: ReportRow[];
  let label: string;
  let columns: string[];

  if (kind === "summary") {
    const summaryModule = getSummaryReportModule(key);
    if (!summaryModule) redirect("/admin/reports?error=unknown-report");
    rows = await summaryModule.fetchRows();
    label = summaryModule.label;
    columns = summaryModule.columns;
  } else {
    const reportModule = getReportModule(key);
    if (!reportModule) redirect("/admin/reports?error=unknown-report");
    rows = await reportModule.fetchRows({ dateFrom, dateTo });
    label = reportModule.label;
    columns = reportModule.columns;
  }

  const datestamp = new Date().toISOString().slice(0, 10);
  const buffer = await rowsToXlsxBuffer(label, columns, rows);

  const result = await sendReportEmail({
    subject: `${label} Report — ${datestamp}`,
    bodyText: `Attached: ${label} report generated ${datestamp}, ${rows.length} record${
      rows.length === 1 ? "" : "s"
    }. Sent on demand by ${user.fullName ?? user.email} from the Ordift Studios Admin Portal.`,
    filename: `${key}-${datestamp}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    attachment: buffer,
  });

  if (!result.ok) redirect(`/admin/reports?error=${result.error}`);

  // Sensitive-data-egress action (report may contain client/payment
  // PII) — audit-logged same as every other privileged mutation, added
  // 2026-08-10 (Workstream I security re-review: this was the one
  // export/email action with no audit trail).
  await logActivity({
    actorUserId: user.id,
    action: "report.emailed",
    metadata: { kind, key, label, rowCount: rows.length, mode: result.mode },
  });

  redirect(`/admin/reports?sent=${encodeURIComponent(label)}&mode=${result.mode}`);
}
