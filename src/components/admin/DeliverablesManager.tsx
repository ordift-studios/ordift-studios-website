import type { AdminDeliverable, DeliverableCategory, DeliverableEntityType } from "@/lib/admin/deliverables";
import { createDeliverableAction, createCategoryAction, deleteDeliverableAction } from "@/app/admin/deliverables/actions";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function DeliverablesManager({
  entityType,
  entityId,
  deliverables,
  categories,
  isAdmin,
}: {
  entityType: DeliverableEntityType;
  entityId: string;
  deliverables: AdminDeliverable[];
  categories: DeliverableCategory[];
  isAdmin: boolean;
}) {
  return (
    <div>
      <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Deliverables</h2>

      {deliverables.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted mb-6">Nothing published yet.</p>
      ) : (
        <div className="space-y-3 mb-6">
          {deliverables.map((d) => (
            <div
              key={d.id}
              className="rounded-lg border border-black/10 bg-white p-4 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-ordift-offwhite font-sans text-caption font-medium text-ordift-ink whitespace-nowrap">
                    {d.categoryLabel}
                  </span>
                </div>
                <p className="font-sans text-body-small text-ordift-ink font-medium">{d.title}</p>
                {d.description && (
                  <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">{d.description}</p>
                )}
                <p className="font-sans text-caption text-ordift-ink-muted mt-1">
                  {formatDate(d.publishedAt)}
                  {d.publishedByName ? ` · ${d.publishedByName}` : ""}
                </p>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 mt-1 inline-block"
                >
                  Open link ↗
                </a>
              </div>
              <form action={deleteDeliverableAction}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="entityType" value={entityType} />
                <input type="hidden" name="entityId" value={entityId} />
                <button
                  type="submit"
                  className="font-sans text-caption text-ordift-ink-muted hover:text-red-700 whitespace-nowrap"
                >
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <form action={createDeliverableAction} className="space-y-3 rounded-lg border border-black/10 bg-white p-4">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="deliverable-title" className="font-sans text-caption text-ordift-ink-muted block mb-1">
              Title
            </label>
            <input
              id="deliverable-title"
              type="text"
              name="title"
              required
              placeholder="e.g. Final Edited Gallery"
              className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
            />
          </div>
          <div>
            <label htmlFor="deliverable-category" className="font-sans text-caption text-ordift-ink-muted block mb-1">
              Category
            </label>
            <select
              id="deliverable-category"
              name="categoryId"
              required
              className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="deliverable-description" className="font-sans text-caption text-ordift-ink-muted block mb-1">
            Description (optional)
          </label>
          <input
            id="deliverable-description"
            type="text"
            name="description"
            className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="deliverable-url" className="font-sans text-caption text-ordift-ink-muted block mb-1">
              Link
            </label>
            <input
              id="deliverable-url"
              type="url"
              name="url"
              required
              placeholder="https://…"
              className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
            />
          </div>
          <div>
            <label htmlFor="deliverable-thumbnail" className="font-sans text-caption text-ordift-ink-muted block mb-1">
              Thumbnail URL (optional)
            </label>
            <input
              id="deliverable-thumbnail"
              type="url"
              name="thumbnailUrl"
              placeholder="https://…"
              className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
            />
          </div>
        </div>
        <button
          type="submit"
          className="min-h-11 px-5 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small"
        >
          Publish Deliverable
        </button>
      </form>

      {isAdmin && (
        <form
          action={createCategoryAction}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-black/15 p-4"
        >
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="entityId" value={entityId} />
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="deliverable-new-category" className="font-sans text-caption text-ordift-ink-muted block mb-1">
              New Category (admin only)
            </label>
            <input
              id="deliverable-new-category"
              type="text"
              name="label"
              placeholder="e.g. Behind the Scenes"
              className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 px-5 rounded-full bg-ordift-offwhite text-ordift-ink font-sans text-body-small"
          >
            Add Category
          </button>
        </form>
      )}
    </div>
  );
}
