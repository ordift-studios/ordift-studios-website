import { notFound } from "next/navigation";

// Development-only pages (proof of concept and the local rate card workspace). In ANY production build — including a Vercel preview or production deployment — every /dev route is a 404,
// so these pages cannot be exposed by a release. A test pins this behaviour.
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <>{children}</>;
}
