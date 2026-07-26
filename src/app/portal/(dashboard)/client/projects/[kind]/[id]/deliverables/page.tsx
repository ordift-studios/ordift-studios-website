import { getCurrentUser } from "@/lib/portal/roles";
import { getClientDeliverables, isProjectKind } from "@/lib/portal/workspace";
import DeliverablesGallery from "@/components/portal/workspace/DeliverablesGallery";

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

  return <DeliverablesGallery deliverables={deliverables} />;
}
