import type { DefinedTerm } from "@/lib/legal/types";

// Splits `text` on whole-word, case-sensitive matches of any defined
// term and wraps each match in a link to its entry in the Definitions
// section (2026-08-04 direction: "Link defined terms consistently
// throughout the document... to improve clarity and future
// maintenance"). Deliberately whole-word + case-sensitive: the source
// documents use capitalization to distinguish a defined term ("Client")
// from the same word used generically ("client" in ordinary prose) —
// matching case-insensitively would link words that were never meant
// to carry the defined meaning.
export default function LinkedText({ text, definitions }: { text: string; definitions: DefinedTerm[] }) {
  if (definitions.length === 0) return <>{text}</>;

  const sorted = [...definitions].sort((a, b) => b.term.length - a.term.length);
  const pattern = new RegExp(`\\b(${sorted.map((d) => escapeRegExp(d.term)).join("|")})\\b`, "g");

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const term = sorted.find((d) => d.term === match![0]);
    if (term) {
      parts.push(
        <a
          key={key++}
          href={`#definitions-${term.id}`}
          className="underline decoration-dotted underline-offset-2 text-ordift-ink hover:text-ordift-gold-pressed"
        >
          {match[0]}
        </a>
      );
    } else {
      parts.push(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
