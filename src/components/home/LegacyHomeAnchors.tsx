"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The homepage's Who We Are, Departments and Process sections now live on their own pages. If a visitor arrives at an old section address
// (for example /#departments), send them to the page and section that now hold that content instead of leaving them on a page with no such section.
const MOVED: Record<string, string> = {
  about: "/about", "who-we-are": "/about#who-we-are", mission: "/about#mission", vision: "/about#vision", values: "/about#values",
  process: "/about#process", departments: "/work#departments", services: "/work#departments", team: "/team", workshops: "/workshops",
};

export default function LegacyHomeAnchors() {
  const router = useRouter();
  useEffect(() => {
    const target = MOVED[window.location.hash.replace(/^#/, "").toLowerCase()];
    if (target) router.replace(target);
  }, [router]);
  return null;
}
