import { normaliseDomain, registrableDomain } from "./names";

// Supplier-approval email — turns text a person pasted (a whole email with headers, or just the body) into the few
// facts the platform keeps. Pure and import-free. Nothing here reads a mailbox: the email reaches the system only
// because a person pasted it into the Admin form.
//
// What is kept (see registry.ts): the sender's DOMAIN (not the address), the subject, the date, the authentication
// verdicts the receiving mail server recorded, a short excerpt and a hash of the text. The full text is not stored.

export type AuthVerdict = "pass" | "fail" | "none" | "unknown";

export type ParsedApprovalEmail = {
  hasHeaders: boolean;
  senderDomain: string | null;
  // True when the sender could only be read from a forwarded block, so the authentication verdicts below describe
  // the forward, not the original message.
  senderFromForward: boolean;
  subject: string | null;
  sentOn: string | null; // YYYY-MM-DD
  spf: AuthVerdict;
  dkim: AuthVerdict;
  dmarc: AuthVerdict;
  // True only when a passing DKIM signature was made for the same registrable domain that appears in From.
  dkimAligned: boolean;
  bodyText: string;
};

export const MAX_PASTE_CHARS = 60_000;
export const EXCERPT_CHARS = 1500;

const HEADER_LINE = /^([A-Za-z][A-Za-z0-9-]{0,40}):[ \t]*(.*)$/;

function splitHeadersAndBody(raw: string): { headers: Map<string, string[]>; body: string; found: boolean } {
  const text = raw.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const headers = new Map<string, string[]>();
  let i = 0;
  let last: { name: string; idx: number } | null = null;
  let count = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") break;
    if (/^[ \t]/.test(line) && last) {
      const arr = headers.get(last.name)!;
      arr[last.idx] += " " + line.trim();
    } else {
      const m = HEADER_LINE.exec(line);
      if (!m) return { headers: new Map(), body: text, found: false };
      const name = m[1].toLowerCase();
      const arr = headers.get(name) ?? [];
      arr.push(m[2].trim());
      headers.set(name, arr);
      last = { name, idx: arr.length - 1 };
      count++;
    }
    i++;
  }
  // Treat as a header block only if it looks like one: at least a From plus one other recognised header.
  const known = ["from", "subject", "date", "to", "message-id", "received", "authentication-results", "return-path"];
  const recognised = known.filter((k) => headers.has(k)).length;
  if (count < 2 || !headers.has("from") || recognised < 2) return { headers: new Map(), body: text, found: false };
  return { headers, body: lines.slice(i + 1).join("\n"), found: true };
}

function addressFrom(value: string | undefined | null): string | null {
  if (!value) return null;
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(value);
  const candidate = angle ? angle[1] : (/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(value)?.[0] ?? null);
  return candidate;
}

export function senderDomainFromAddress(value: string | null | undefined): string | null {
  const addr = addressFrom(value ?? null);
  return addr ? normaliseDomain(addr) : null;
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function verdictFrom(results: string[], mechanism: "spf" | "dkim" | "dmarc"): AuthVerdict {
  const found: string[] = [];
  const re = new RegExp(`\\b${mechanism}=([a-z]+)`, "gi");
  for (const r of results) for (const m of r.matchAll(re)) found.push(m[1].toLowerCase());
  if (found.length === 0) return "unknown";
  if (found.includes("pass")) return "pass";
  if (found.some((v) => v === "fail" || v === "softfail" || v === "permerror" || v === "temperror")) return "fail";
  if (found.every((v) => v === "none" || v === "neutral")) return "none";
  return "unknown";
}

function dkimAlignedWith(results: string[], senderDomain: string | null): boolean {
  if (!senderDomain) return false;
  const want = registrableDomain(senderDomain);
  for (const r of results) {
    // Look at each dkim result and the signing domain it names (header.d= / header.i=@domain).
    for (const part of r.split(";")) {
      if (!/\bdkim=pass\b/i.test(part)) continue;
      const d = /header\.d=([A-Za-z0-9.-]+)/i.exec(part)?.[1] ?? /header\.i=@?([A-Za-z0-9.-]+)/i.exec(part)?.[1];
      if (d && registrableDomain(d) === want) return true;
    }
  }
  return false;
}

function stripMarkup(s: string): string {
  // Only treat the text as HTML when it contains real markup tags; "<name@example.com>" in a plain-text email is an address.
  if (!/<\/?(html|body|head|p|div|br|span|table|tr|td|style|b|i|a|ul|li|h[1-6])\b[^>]*>/i.test(s)) return s;
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// Gmail/Outlook forward blocks carry the original headers inside the body.
function forwardedSender(body: string): { domain: string | null; subject: string | null; sentOn: string | null } | null {
  const marker = /(-{2,}\s*Forwarded message\s*-{2,}|Begin forwarded message:|-----Original Message-----|^From:.+\n(?:.*\n){0,4}?Subject:)/im.exec(body);
  if (!marker) return null;
  const rest = body.slice(marker.index);
  const from = /^\s*From:\s*(.+)$/im.exec(rest)?.[1];
  const subject = /^\s*Subject:\s*(.+)$/im.exec(rest)?.[1]?.trim() ?? null;
  const date = /^\s*(?:Date|Sent):\s*(.+)$/im.exec(rest)?.[1];
  const domain = senderDomainFromAddress(from);
  if (!domain) return null;
  return { domain, subject, sentOn: parseDate(date) };
}

export function parseApprovalEmail(raw: string, opts: { senderAddress?: string | null; ownDomains?: string[] } = {}): ParsedApprovalEmail {
  const text = raw.slice(0, MAX_PASTE_CHARS);
  const { headers, body, found } = splitHeadersAndBody(text);
  const first = (name: string) => headers.get(name)?.[0];
  const authResults = [...(headers.get("authentication-results") ?? []), ...(headers.get("received-spf") ?? []).map((v) => `spf=${v.split(/\s+/)[0].toLowerCase()}`)];

  const own = (opts.ownDomains ?? []).map((d) => registrableDomain(d)).filter((d): d is string => d !== null);
  const isOwn = (d: string | null) => d !== null && own.includes(registrableDomain(d) ?? "");

  let senderDomain = senderDomainFromAddress(first("from"));
  let senderFromForward = false;
  let subject = first("subject") ?? null;
  let sentOn = parseDate(first("date"));
  const cleanedBody = stripMarkup(body).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  // A person who forwards the email to themselves (or to a colleague) makes the From header an Ordift address. The
  // original sender is then only visible inside the forwarded block, where there are no authentication verdicts.
  if (found && isOwn(senderDomain)) {
    const fwd = forwardedSender(cleanedBody);
    if (fwd) {
      senderDomain = fwd.domain;
      senderFromForward = true;
      subject = fwd.subject ?? subject;
      sentOn = fwd.sentOn ?? sentOn;
    }
  }
  if (!found) {
    const fwd = forwardedSender(cleanedBody);
    const typed = senderDomainFromAddress(opts.senderAddress ?? null);
    senderDomain = typed ?? fwd?.domain ?? null;
    senderFromForward = !typed && fwd !== null;
    if (fwd) {
      subject = fwd.subject;
      sentOn = fwd.sentOn;
    }
  } else if (opts.senderAddress && !senderDomain) {
    senderDomain = senderDomainFromAddress(opts.senderAddress);
  }

  const verdictsApply = found && !senderFromForward;
  return {
    hasHeaders: found,
    senderDomain,
    senderFromForward,
    subject,
    sentOn,
    spf: verdictsApply ? verdictFrom(authResults, "spf") : "unknown",
    dkim: verdictsApply ? verdictFrom(authResults, "dkim") : "unknown",
    dmarc: verdictsApply ? verdictFrom(authResults, "dmarc") : "unknown",
    dkimAligned: verdictsApply ? dkimAlignedWith(authResults, senderDomain) : false,
    bodyText: cleanedBody,
  };
}

// Whitespace- and case-insensitive form used for duplicate-submission detection (the same email pasted twice).
export function normalisedForHash(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").toLowerCase().replace(/\s+/g, " ").trim();
}

export function excerptOf(bodyText: string): string {
  const collapsed = bodyText.replace(/\s+/g, " ").trim();
  return collapsed.length > EXCERPT_CHARS ? collapsed.slice(0, EXCERPT_CHARS - 1) + "…" : collapsed;
}
