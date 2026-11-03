import { footerColumns, type ContactSnapshot } from "@/lib/brand/letterheadContacts";

// The contact strip of the Ordift letterhead for HTML print views: the approved icons over live contact text, in the approved letterhead's positions (measured from the approved image),
// printed on the base letterhead image (public/brand/os-letterhead-base.jpg: the approved page without its fixed contact strip). Used inside an element with `position: relative` that is
// 210mm wide. The contact details come from src/lib/brand/letterheadContacts.ts; nothing here holds a number or address of its own.
const POSITIONS: Record<number, { cx: number; w: number }[]> = {
  3: [{ cx: 25.5, w: 40 }, { cx: 64.1, w: 30 }, { cx: 97.1, w: 36 }],
  2: [{ cx: 25.5, w: 40 }, { cx: 64.1, w: 36 }],
};
const RULES: Record<number, number[]> = { 3: [49.3, 80.3], 2: [49.3] };

export const LETTERHEAD_BASE_IMAGE = "/brand/os-letterhead-base.jpg";
export const LETTERHEAD_FOOTER_CSS = `
  .lh-icon { position: absolute; top: 265.7mm; width: 8.5mm; height: 8.5mm; background-size: contain; background-repeat: no-repeat; }
  .lh-text { position: absolute; top: 279.2mm; font: 8.2pt Helvetica, Arial, sans-serif; color: #292929; text-align: center; white-space: pre-line; }
  .lh-rule { position: absolute; top: 265.8mm; height: 26mm; width: 0.3mm; background: #292929; }
`;

export default function LetterheadFooter({ contacts }: { contacts: ContactSnapshot }) {
  const cols = footerColumns(contacts);
  const pos = POSITIONS[cols.length] ?? POSITIONS[2];
  return (
    <div aria-hidden="true">
      {(RULES[cols.length] ?? RULES[2]).map((x) => <div key={x} className="lh-rule" style={{ left: `${x}mm` }} />)}
      {cols.map((col, i) => (
        <div key={col.icon}>
          <div className="lh-icon" style={{ left: `${pos[i].cx - 4.25}mm`, backgroundImage: `url(/brand/letterhead-icons/${col.icon}.png)` }} />
          <div className="lh-text" style={{ left: `${pos[i].cx - pos[i].w / 2}mm`, width: `${pos[i].w}mm` }}>{col.lines.join("\n")}</div>
        </div>
      ))}
    </div>
  );
}
