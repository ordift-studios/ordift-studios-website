import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { getWorkspaceOverview, isProjectKind } from "@/lib/portal/workspace";
import WorkspaceHeader from "@/components/portal/workspace/WorkspaceHeader";
import TabNav from "@/components/portal/workspace/TabNav";

export const metadata: Metadata = {
  title: "Project Workspace — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

// The single reusable shell every project opens into, regardless of
// kind (enquiry today; workshop too; vendor engagement, model booking,
// or a future business module once those have real bookable records).
// Ownership is enforced here once — getWorkspaceOverview returns null
// for both "doesn't exist" and "not this user's project" (RLS already
// guarantees the same at the database level; this is the app-layer
// defense-in-depth check, same pattern as every other portal page).
export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isProjectKind(kind)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/portal/login?next=/portal/client");

  const overview = await getWorkspaceOverview(kind, id, user.id);
  if (!overview) notFound();

  return (
    <div>
      <WorkspaceHeader overview={overview} />
      <TabNav basePath={`/portal/client/projects/${kind}/${id}`} />
      {children}
    </div>
  );
}
