import { contentRepository } from "@/lib/content";
import NavBarClient from "./NavBarClient";

// Server Component wrapper — fetches Navigation content (Version 1.2.6)
// and hands it to the client component that owns the mobile-menu
// interactivity. Every existing `<NavBar />` call site is unchanged: it
// still takes no props, since the fetch happens here instead.
export default async function NavBar() {
  const nav = await contentRepository.getNavigation();
  return <NavBarClient links={nav.links} primaryCta={nav.primaryCta} />;
}
