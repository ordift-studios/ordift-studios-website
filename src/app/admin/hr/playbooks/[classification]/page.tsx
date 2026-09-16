import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { buildOnboardingPlaybook, ONBOARDING_CLASSIFICATIONS, type OnboardingClassification } from "@/lib/organization/onboardingPlaybook";

export const metadata: Metadata = {
  title: "Onboarding Playbook — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

function isValidClassification(v: string): v is OnboardingClassification {
  return ONBOARDING_CLASSIFICATIONS.some((c) => c.key === v);
}

export default async function OnboardingPlaybookDetailPage({ params }: { params: Promise<{ classification: string }> }) {
  const { classification } = await params;
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");
  if (!isValidClassification(classification)) notFound();

  const playbook = buildOnboardingPlaybook(classification);

  return (
    <div className="max-w-3xl">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/hr/playbooks" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
            ← Onboarding Playbooks
          </Link>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mt-3">{playbook.label}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/hr/playbooks/${classification}/pdf?view=internal`} target="_blank" className="font-sans text-caption font-semibold px-3 py-2 rounded-md border border-black/15 text-ordift-ink">
            Internal PDF →
          </Link>
          <Link href={`/admin/hr/playbooks/${classification}/pdf?view=external`} target="_blank" className="font-sans text-caption font-semibold px-3 py-2 rounded-md border border-black/15 text-ordift-ink">
            External PDF →
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 mb-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-1">{playbook.internalGuideTitle}</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mb-4">What authorized Ordift staff do at each stage.</p>
        <ol className="space-y-3">
          {playbook.steps.map((step, i) => (
            <li key={step.stageKey}>
              <p className="font-sans text-body-small font-semibold text-ordift-ink">{i + 1}. {step.stageLabel}</p>
              {step.internalActions.length > 0 ? (
                <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                  {step.internalActions.map((a, j) => (
                    <li key={j} className="font-sans text-body-small text-ordift-ink-muted">{a}</li>
                  ))}
                </ul>
              ) : (
                <p className="font-sans text-caption text-ordift-ink-muted pl-4">No specific requirement gates this stage — advance when genuinely ready.</p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-1">{playbook.externalGuideTitle}</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mb-4">What you, the {playbook.label.toLowerCase()}, need to do — no internal/administrative detail.</p>
        <ol className="space-y-3">
          {playbook.steps
            .filter((s) => s.externalActions.length > 0)
            .map((step, i) => (
              <li key={step.stageKey}>
                <p className="font-sans text-body-small font-semibold text-ordift-ink">{i + 1}. {step.stageLabel}</p>
                <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                  {step.externalActions.map((a, j) => (
                    <li key={j} className="font-sans text-body-small text-ordift-ink-muted">{a}</li>
                  ))}
                </ul>
              </li>
            ))}
        </ol>
      </section>
    </div>
  );
}
