import type { DefinedTerm, LegalContentNode, LegalSection as LegalSectionType } from "@/lib/legal/types";
import LinkedText from "./LinkedText";

function ContentNode({ node, definitions }: { node: LegalContentNode; definitions: DefinedTerm[] }) {
  switch (node.type) {
    case "paragraph":
      return (
        <p className="font-sans text-body text-ordift-ink-muted leading-relaxed">
          <LinkedText text={node.text} definitions={definitions} />
        </p>
      );
    case "subheading":
      return <h4 className="font-sans font-semibold text-body text-ordift-ink mt-2">{node.text}</h4>;
    case "list": {
      const Tag = node.ordered ? "ol" : "ul";
      return (
        <Tag className={`font-sans text-body text-ordift-ink-muted leading-relaxed space-y-1.5 pl-5 ${node.ordered ? "list-decimal" : "list-disc"}`}>
          {node.items.map((item, i) => (
            <li key={i}>
              <LinkedText text={item} definitions={definitions} />
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border border-black/10">
          <table className="w-full text-left font-sans text-body-small">
            <thead>
              <tr className="bg-ordift-offwhite">
                {node.headers.map((h) => (
                  <th key={h} scope="col" className="px-4 py-2.5 font-semibold text-ordift-ink border-b border-black/10">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {node.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-2.5 text-ordift-ink-muted align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "divider":
      return <hr className="border-black/10" />;
    default:
      return null;
  }
}

// Purely numeric/decimal section numbers ("5", "5.1") read naturally
// with a trailing period ("5. Information We Collect"); word-based
// appendix labels ("Appendix A") don't ("Appendix A. Interpretation"
// reads wrong) — this decides which based on the number's own shape
// rather than a per-section flag. Single-letter subsection numbers
// (Cookie Policy's "A", "B", ...) read like numeric ones ("A.") since
// they never contain a space or lowercase letter the way "Appendix A"
// does.
const NUMERIC_SECTION = /^[\dA-Z.]+$/;

export default function LegalSection({ section, definitions }: { section: LegalSectionType; definitions: DefinedTerm[] }) {
  const HeadingTag = section.level === 1 ? "h2" : "h3";
  const headingClass =
    section.level === 1
      ? "font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink"
      : "font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink";
  const numberSuffix = NUMERIC_SECTION.test(section.number) ? "." : " —";
  // Definitions cross-linking is intentionally skipped inside the
  // Definitions section itself — a term's own entry linking to itself
  // would be circular and adds no navigational value.
  const linkableDefinitions = section.id === "definitions" ? [] : definitions;

  return (
    <section id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-24 space-y-3">
      <HeadingTag id={`${section.id}-heading`} className={headingClass}>
        <span className="text-ordift-gold-pressed mr-2">
          {section.number}
          {numberSuffix}
        </span>
        {section.heading}
      </HeadingTag>
      {section.content.map((node, i) => (
        <ContentNode key={i} node={node} definitions={linkableDefinitions} />
      ))}
    </section>
  );
}
