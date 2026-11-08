import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTACT_SNAPSHOT_VERSION, LETTERHEAD_CONTACTS, WEBSITE_DISPLAY, WEBSITE_DOMAIN, contactsFor, footerColumns, parseContactSnapshot, snapshotContacts } from "./letterheadContacts";
import { PRIMARY_PUBLIC_CONTACT_EMAIL, PUBLIC_CONTACT_EMAILS } from "@/lib/content/contactChannels";

describe("the shared website and contact configuration", () => {
  it("has the correct website, as printed in the approved Privacy Notice", () => {
    expect(WEBSITE_DOMAIN).toBe("ordiftstudios.com");
    expect(WEBSITE_DISPLAY).toBe("www.ordiftstudios.com");
    const privacy = readFileSync(new URL("../legal/documents/os-lgl-001-privacy.ts", import.meta.url), "utf8");
    expect(privacy).toContain(`Website: ${WEBSITE_DISPLAY}`);
  });
  it("uses only approved values: the public mailbox from the contact-channel configuration, never the internal Gmail address", () => {
    for (const c of Object.values(LETTERHEAD_CONTACTS)) {
      expect(Object.values(PUBLIC_CONTACT_EMAILS)).toContain(c.email.value);
      expect(c.email.value).toBe(PRIMARY_PUBLIC_CONTACT_EMAIL);
      expect(JSON.stringify(c)).not.toMatch(/gmail|matetey/i);
    }
  });
  it("takes each telephone number from the approved Privacy Notice, assigned by country code", () => {
    const privacy = readFileSync(new URL("../legal/documents/os-lgl-001-privacy.ts", import.meta.url), "utf8");
    expect(privacy).toContain('"+974 5510 4490", "+233 504 981 277"');
    expect(LETTERHEAD_CONTACTS.Qatar.phone?.value).toBe("+974 5510 4490");
    expect(LETTERHEAD_CONTACTS.Ghana.phone?.value).toBe("+233 504 981 277");
  });
  it("matches the contact details management confirmed on 4 Nov 2026, exactly", () => {
    expect(snapshotContacts(contactsFor("Qatar"))).toEqual({ version: CONTACT_SNAPSHOT_VERSION, jurisdiction: "Qatar", email: "enquiries@ordiftstudios.com", phone: "+974 5510 4490", website: "www.ordiftstudios.com" });
    expect(snapshotContacts(contactsFor("Ghana"))).toEqual({ version: CONTACT_SNAPSHOT_VERSION, jurisdiction: "Ghana", email: "enquiries@ordiftstudios.com", phone: "+233 504 981 277", website: "www.ordiftstudios.com" });
  });
  it("has no WhatsApp number anywhere in the configuration, and no other mailbox", () => {
    const all = JSON.stringify(LETTERHEAD_CONTACTS) + readFileSync(new URL("./letterheadContacts.ts", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    expect(all).not.toMatch(/7777|447777|whatsapp/i);
    expect(all).not.toMatch(/commercials@|bookings@|accounts@|info@|careers@/);
  });
  it("selects by the entity's jurisdiction; an unknown jurisdiction gets no telephone (nothing is guessed)", () => {
    const other = contactsFor("Atlantis");
    expect(other.phone).toBeNull();
    expect(footerColumns(snapshotContacts(other)).map((c) => c.icon)).toEqual(["email", "web"]);
    expect(footerColumns(snapshotContacts(contactsFor(null))).map((c) => c.icon)).toEqual(["email", "web"]);
    expect(footerColumns(snapshotContacts(contactsFor("Qatar"))).map((c) => c.icon)).toEqual(["email", "phone", "web"]);
  });
});

describe("the contact snapshot that is frozen into an issued quotation", () => {
  it("round-trips through stored audit metadata", () => {
    const snap = snapshotContacts(contactsFor("Ghana"));
    expect(parseContactSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });
  it("is read back strictly: anything malformed, partial or of another version is treated as no snapshot, never partially trusted", () => {
    const ok = snapshotContacts(contactsFor("Qatar"));
    for (const bad of [null, undefined, "x", 5, {}, { ...ok, version: 2 }, { ...ok, email: "" }, { ...ok, website: 7 }, { ...ok, phone: 12 }, { ...ok, email: "a\nb@x" }, { ...ok, jurisdiction: 3 }, { ...ok, email: "e".repeat(200) }]) expect(parseContactSnapshot(bad)).toBeNull();
    expect(parseContactSnapshot({ ...ok, phone: null })).toMatchObject({ phone: null });
  });
  it("holds only what is printed: no source notes, statuses or other fields", () => {
    expect(Object.keys(snapshotContacts(contactsFor("Qatar"))).sort()).toEqual(["email", "jurisdiction", "phone", "version", "website"]);
  });
});

describe("the website is spelt correctly everywhere, and written once", () => {
  const git = (cmd: string) => { try { return execSync(cmd, { encoding: "utf8", cwd: process.cwd() }); } catch (e) { return (e as { stdout?: string }).stdout ?? ""; } };
  // The ONE exemption: scripts/build_letterhead_assets.py quotes the old spelling on purpose, because it detects it in the original letterhead image and redraws it correctly. Nothing else may contain it.
  const QUOTES_OLD_SPELLING = "scripts/build_letterhead_assets.py";
  it("the misspelling appears in no tracked text file", () => {
    expect(git(`git grep -n -I -i -E "odiftstudios" -- src scripts docs "*.md" ":!*.test.ts" ":!${QUOTES_OLD_SPELLING}"`).trim()).toBe("");
  });
  it("the exemption is real and narrow: only the letterhead build script quotes the old spelling, and it also writes the correct one", () => {
    const hits = git(`git grep -l -I -i -E "odiftstudios" -- src scripts docs "*.md" ":!*.test.ts"`).trim().split("\n").filter(Boolean);
    expect(hits).toEqual([QUOTES_OLD_SPELLING]);
    expect(git(`git grep -c "www.ordiftstudios.com" -- ${QUOTES_OLD_SPELLING}`)).toMatch(/\d+/);
  });
  it("the PDF templates take the domain from the shared configuration instead of repeating it", () => {
    const out = git('git grep -n -I "ordiftstudios.com" -- src/lib/pdf src/lib/portfolio ":!*.test.ts"').trim();
    expect(out).toBe("");
  });
  it("no application template prints the old letterhead's baked-in contact strip (which carried the internal Gmail address), except the one the Founder decided to leave unchanged: the HR-playbook print page (decision C, 8 Nov 2026; the old strip is to be reviewed in a later document-standardisation exercise)", () => {
    const out = git('git grep -l -I -E "/brand/os-letterhead\\.jpg" -- src ":!*.test.ts"').trim().split("\n").filter(Boolean);
    expect(out).toEqual(["src/app/admin/hr/playbooks/[classification]/pdf/page.tsx"]);
  });
  it("the approved letterhead image has one copy under brand/ and one under public/, kept identical", () => {
    const a = readFileSync("brand/legal-publications/os-letterhead.jpg"); const b = readFileSync("public/brand/os-letterhead.jpg");
    expect(a.equals(b)).toBe(true);
  });
});
