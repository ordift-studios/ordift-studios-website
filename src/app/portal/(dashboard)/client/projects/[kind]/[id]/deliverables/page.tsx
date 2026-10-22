import { getCurrentUser } from "@/lib/portal/roles";
import { getClientDeliverables, isProjectKind } from "@/lib/portal/workspace";
import DeliverablesGallery from "@/components/portal/workspace/DeliverablesGallery";
import { ConfirmDeliveryCard, DownloadAllCard, RateExperienceCard } from "@/components/portal/workspace/DeliveryExtras";
import { getDeliveryEvents, getLatestRating, getReleasedContext } from "@/lib/portal/clientDeliveryData";
import { batchHash, deriveDeliveryState, formatBytes } from "@/lib/portal/clientDelivery";
import { confirmDeliveryAction, submitRatingAction } from "../deliveryActions";

export default async function DeliverablesTabPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isProjectKind(kind)) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const deliverables = await getClientDeliverables(kind, id, user.id);
  const requestsHref = kind === "enquiry" ? `/portal/client/projects/${kind}/${id}/requests` : undefined;

  // The delivery tools apply to projects whose photographs were RELEASED from an assignment (stored, authorised files).
  const released = kind === "enquiry" ? await getReleasedContext(id, user.id) : null;
  const hasReleased = Boolean(released && released.files.length > 0);
  const state = hasReleased && released ? deriveDeliveryState(await getDeliveryEvents(id), batchHash(released.files.map((f) => f.fileId))) : null;
  const rating = hasReleased ? await getLatestRating(id) : null;

  return (
    <div>
      {hasReleased && released && (
        <DownloadAllCard
          href={`/portal/client/projects/enquiry/${id}/download-all`}
          count={released.files.length}
          sizeText={formatBytes(released.files.reduce((n, f) => n + f.sizeBytes, 0))}
        />
      )}
      <DeliverablesGallery deliverables={deliverables} requestsHref={requestsHref} />
      {hasReleased && state && (
        <>
          <ConfirmDeliveryCard enquiryId={id} state={state} action={confirmDeliveryAction} requestsHref={requestsHref} />
          <RateExperienceCard enquiryId={id} action={submitRatingAction} alreadyRatedAt={rating?.at ?? null} />
        </>
      )}
    </div>
  );
}
