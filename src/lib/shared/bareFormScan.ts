// Counts "bare" forms: a <form ... action={...}> in a file that uses useActionState, with no ref (so nothing restores what the person typed when React 19 resets the form after a refusal).
// Used only by the guard test and the baseline generator. Pure text scan, no I/O.
export function bareFormCount(source: string): number {
  if (!source.includes("useActionState")) return 0;
  let n = 0;
  for (const m of source.matchAll(/<form\b/g)) {
    const rest = source.slice(m.index!, m.index! + 600);
    const end = rest.search(/(?<![=])>/);                       // the first '>' that is not the arrow of an inline handler
    const tag = end < 0 ? rest : rest.slice(0, end);
    if (/\baction=\{/.test(tag) && !/\bref=\{/.test(tag)) n++;
  }
  return n;
}
