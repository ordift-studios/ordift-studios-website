export default function WelcomeBanner({ name }: { name: string | null }) {
  return (
    <section className="bg-ordift-navy-950 text-white rounded-2xl p-8">
      <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-2">
        Client Workspace
      </p>
      <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop">
        Welcome back{name ? `, ${name}` : ""}
      </h1>
    </section>
  );
}
