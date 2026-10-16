import { contentRepository } from "@/lib/content";
import { getCurrentUser, primaryPortalPath } from "@/lib/portal/roles";
import { buildMainNavigation, withHrefFallback } from "@/lib/content/navigationHelpers";
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
//
// Nav-link self-heal (2026-09-20) — see withHrefFallback()'s own
// header comment (src/lib/content/navigationHelpers.ts) for the root
// cause this addresses (a blank CMS href reading as "nothing happens"
// on click).
export default async function NavBar({ transparent = false }: { transparent?: boolean }) {
  const [nav, footer, user] = await Promise.all([contentRepository.getNavigation(), contentRepository.getFooterSettings(), getCurrentUser()]);
  const accountHref = user ? primaryPortalPath(user.roles) : null;
  // Main navigation structure (2026-10-17): ABOUT | PORTFOLIO | TALENT | CONTACT | MY ACCOUNT — see buildMainNavigation().
  const items = buildMainNavigation({ cmsLinks: withHrefFallback(nav.links), footerColumns: footer.columns, accountHref });
  return <NavBarClient items={items} primaryCta={nav.primaryCta} transparent={transparent} />;
}
