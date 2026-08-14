import { contentRepository } from "@/lib/content";
import { getCurrentUser, primaryPortalPath } from "@/lib/portal/roles";
import NavBarClient from "./NavBarClient";

// Server Component wrapper — fetches Navigation content (Version 1.2.6)
// and hands it to the client component that owns the mobile-menu
// interactivity. Every existing `<NavBar />` call site is unchanged: it
// still takes no props, since the fetch happens here instead.
//
// Auth-aware nav entry points (2026-08-14): also resolves the visitor's
// session and, if authenticated, their role-based destination via the
// same primaryPortalPath() the login action already uses — computed
// once, here, server-side, and passed down as a plain href. This
// deliberately avoids re-implementing role-routing logic in the client
// component (or anywhere else) a second time.
export default async function NavBar() {
  const [nav, user] = await Promise.all([contentRepository.getNavigation(), getCurrentUser()]);
  const accountHref = user ? primaryPortalPath(user.roles) : null;
  return <NavBarClient links={nav.links} primaryCta={nav.primaryCta} accountHref={accountHref} />;
}
