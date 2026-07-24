import { redirect } from "next/navigation";
import { getCurrentUser, primaryPortalPath } from "@/lib/portal/roles";

export default async function PortalRootPage() {
  const user = await getCurrentUser();
  redirect(user ? primaryPortalPath(user.roles) : "/portal/login");
}
