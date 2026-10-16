import { permanentRedirect } from "next/navigation";

// Our Process now lives on the About page (2026-10-17), alongside Who We Are, Mission, Vision and Values. This address stays working: it
// sends visitors (and any link or search result that already points here) to that section, so the content is not duplicated on two pages.
export default function ProcessPage() {
  permanentRedirect("/about#process");
}
