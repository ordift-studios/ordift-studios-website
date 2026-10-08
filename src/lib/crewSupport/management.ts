import { isSuperAdmin, type CurrentUser } from "@/lib/portal/roles";
import { isExecutiveAdmin } from "@/lib/organization/authority";

// Authorised management = Super Admin or an executive-admin authority
// holder. Used for decisions with financial consequence (cancelling a
// confirmed request). Server-only; never exposed as a server action.
export async function isManagementUser(user: CurrentUser): Promise<boolean> {
  return isSuperAdmin(user) || (await isExecutiveAdmin(user.id));
}
