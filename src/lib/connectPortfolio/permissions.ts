import { isSuperAdmin, type CurrentUser } from "@/lib/portal/roles";

// The QR portfolio manager is Super Admin only: the same single check as the QR Code Manager and the team portrait upload. Every page, server action and route calls this itself; the menu link is
// only a convenience. No new role, grant or setting.
export const canManageConnectPortfolio = (user: CurrentUser | null): boolean => isSuperAdmin(user);
