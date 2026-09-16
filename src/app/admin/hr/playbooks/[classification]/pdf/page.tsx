import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { buildOnboardingPlaybook, ONBOARDING_CLASSIFICATIONS, type OnboardingClassification } from "@/lib/organization/onboardingPlaybook";
import { PrintButton } from "@/components/admin/PrintButton";

export const metadata: Metadata = {
  title: "Onboarding Guide PDF — Ordift Studios",
  robots: { index: false, follow: false },
};

function isValidClassification(v: string): v is OnboardingClassification {
  return ONBOARDING_CLASSIFICATIONS.some((c) => c.key === v);
}

// Controlled downloadable guide (2026-09-16, Task 8/AC) — same
// zero-new-dependency letterhead print pattern as the Quotation PDF
// (PrintButton reused as-is, never duplicated). ?view=internal|external
// selects which of the two guides to render; external is the safe
// default (never leaks internal detail by an omitted/mistyped param).
export default async function PlaybookPdfPage({
  params,
  searchParams,
}: {
  params: Promise<{ classification: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { classification } = await params;
  const { view } = await searchParams;
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");
  if (!isValidClassification(classification)) notFound();

  const playbook = buildOnboardingPlaybook(classification);
  const isInternal = view === "internal";
  const title = isInternal ? playbook.internalGuideTitle : playbook.externalGuideTitle;
  const steps = isInternal ? playbook.steps : playbook.steps.filter((s) => s.externalActions.length > 0);

  return (
    <div className="print-page">
      <style>{`
        .print-page {
          position: relative;
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background-image: url(/brand/os-letterhead.jpg);
          background-size: cover;
          background-position: top center;
          background-repeat: no-repeat;
          box-sizing: border-box;
          padding: 55mm 20mm 30mm 20mm;
          font-family: Georgia, 'Times New Roman', serif;
          color: #1a1a1a;
        }
        @media print {
          .print-toolbar { display: none; }
          body { margin: 0; }
          header, nav { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
        }
        ol { padding-left: 18px; }
        li { margin-bottom: 12px; font-size: 12px; }
        li strong { display: block; font-size: 13px; margin-bottom: 4px; }
        ul { margin-top: 4px; padding-left: 16px; }
        ul li { font-size: 11px; color: #333; margin-bottom: 2px; }
      `}</style>

      <PrintButton />

      <h1 style={{ fontSize: 18, marginBottom: 4 }}>{title}</h1>
      <p style={{ fontSize: 10, color: "#666", marginBottom: 24 }}>
        Version: derived from the current Production onboarding configuration · Generated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
      </p>

      <ol>
        {steps.map((step, i) => (
          <li key={step.stageKey}>
            <strong>{i + 1}. {step.stageLabel}</strong>
            <ul>
              {(isInternal ? step.internalActions : step.externalActions).map((a, j) => (
                <li key={j}>{a}</li>
              ))}
              {isInternal && step.internalActions.length === 0 && <li>No specific requirement gates this stage.</li>}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
