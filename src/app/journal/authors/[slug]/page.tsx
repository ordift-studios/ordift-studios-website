import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import JournalPostCard from "@/components/journal/JournalPostCard";
import Avatar from "@/components/media/Avatar";
import { contentRepository } from "@/lib/content";

export async function generateStaticParams() {
  const authors = await contentRepository.getAuthors();
  return authors.map((author) => ({ slug: author.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const author = await contentRepository.getAuthorBySlug(slug);
  if (!author) return {};
  return { title: `${author.name} — Ordift Studios Stories`, description: author.title };
}

export default async function AuthorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const author = await contentRepository.getAuthorBySlug(slug);
  if (!author) notFound();

  const [allPosts, categories] = await Promise.all([
    contentRepository.getJournalPosts(),
    contentRepository.getJournalCategories(),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const posts = allPosts.filter((p) => p.authorId === author.id);

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto flex items-center gap-6">
          <Avatar src={author.photoUrl} alt={author.name} size={96} />
          <div>
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-3">
              Author
              {author.isPlaceholder && " · Placeholder"}
            </p>
            <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop">
              {author.name}
            </h1>
            <p className="font-sans text-body text-white/70 mt-2">{author.title}</p>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-4xl mx-auto">
          <p className="font-sans text-body text-ordift-ink mb-10 max-w-2xl">{author.bio}</p>

          {posts.length > 0 && (
            <div>
              <p className="font-serif font-medium text-card-title text-ordift-ink mb-4">
                Stories by {author.name}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {posts.map((post) => (
                  <JournalPostCard
                    key={post.id}
                    post={post}
                    categories={post.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                    author={author}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
