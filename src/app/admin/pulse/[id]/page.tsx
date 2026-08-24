import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getPulseArticleDetail } from "@/lib/content/sanity/pulseAdmin";
import { getPulsePublishReadiness } from "@/lib/pulse/publishReadiness";
import { PERMISSION_LABEL, TRUST_LABEL } from "@/lib/pulse/adminLabels";
import { ArticleActions } from "./ArticleActions";

export const metadata: Metadata = { title: "Pulse Article — Ordift Studios Admin", robots: { index: false, follow: false } };

export default async function AdminPulseArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const { id } = await params;
  const article = await getPulseArticleDetail(id);
  if (!article) notFound();

  const readiness = getPulsePublishReadiness({
    title: article.title,
    excerpt: article.excerpt,
    body: article.body,
    hasHeroMedia: article.hasHeroMedia,
  });
  const isRejected = article.tags.includes("rejected");

  return (
    <div className="max-w-3xl">
      <Link href="/admin/pulse" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
        ← Back to Ordift Pulse
      </Link>

      <div className="mt-4 mb-6">
        <p className="font-sans font-semibold uppercase tracking-[0.15em] text-eyebrow text-ordift-gold-pressed mb-2">
          {article.status}
          {isRejected && " · rejected"}
          {article.tags.includes("flagged-for-review") && " · flagged for review"}
        </p>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">{article.title}</h1>
      </div>

      {article.source && article.source.permissionClassification !== "green" && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="font-sans text-body-small text-amber-900">
            This source is <strong>{PERMISSION_LABEL[article.source.permissionClassification]}</strong>, not Green. Verify what this
            source&rsquo;s licence actually permits before publishing — do not reproduce its text or images as Ordift content.
          </p>
        </div>
      )}

      {!readiness.ready && (
        <div className="mb-6 rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3">
          <p className="font-sans font-semibold text-body-small text-ordift-ink mb-1">Not ready to publish:</p>
          <ul className="list-disc list-inside font-sans text-body-small text-ordift-ink-muted space-y-0.5">
            {readiness.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6">
        <ArticleActions articleId={article.id} status={article.status} isRejected={isRejected} />
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 bg-white rounded-lg border border-ordift-ink/10 p-5">
        <Field label="Source">{article.source?.name ?? "—"}</Field>
        <Field label="Source Trust">{article.source ? TRUST_LABEL[article.source.editorialTrustLevel] : "—"}</Field>
        <Field label="Source Permission">{article.source ? PERMISSION_LABEL[article.source.permissionClassification] : "—"}</Field>
        <Field label="Image Use Permitted">{article.source?.imageUsePermitted ? "Yes" : "No"}</Field>
        <Field label="Topic">{article.categoryNames.join(", ") || "—"}</Field>
        <Field label="Region">{article.regionNames.join(", ") || "—"}</Field>
        <Field label="Relevance Score">{article.relevanceScore?.toFixed(1) ?? "—"}</Field>
        <Field label="Hero Media">{article.hasHeroMedia ? "Set" : "Not set"}</Field>
        <Field label="Duplicate Of">
          {article.duplicateOf ? (
            <Link href={`/admin/pulse/${article.duplicateOf.id}`} className="text-ordift-gold-pressed underline underline-offset-4">
              {article.duplicateOf.title}
            </Link>
          ) : (
            "—"
          )}
        </Field>
        {article.sourceUrl && (
          <Field label="Source URL">
            <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-ordift-gold-pressed underline underline-offset-4 break-all">
              Read at source →
            </a>
          </Field>
        )}
      </dl>

      <Section label="Excerpt (public if published)">{article.excerpt}</Section>
      <Section label="Body (public if published)">{article.body}</Section>
      {article.aiSummary && <Section label="AI-Generated Summary (source material — internal only, never public)">{article.aiSummary}</Section>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">{label}</dt>
      <dd className="font-sans text-body-small text-ordift-ink">{children}</dd>
    </div>
  );
}

function Section({ label, children }: { label: string; children: string }) {
  return (
    <div className="mb-6">
      <p className="font-sans font-semibold uppercase tracking-[0.1em] text-caption text-ordift-ink-muted mb-2">{label}</p>
      <p className="font-sans text-body-small text-ordift-ink whitespace-pre-line bg-white rounded-lg border border-ordift-ink/10 p-4">{children}</p>
    </div>
  );
}
