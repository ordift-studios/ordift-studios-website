import type { LegalDocument, LegalSection, LegalContentNode } from "./types";

// Standing provisions applied to every document in the Ordift Studios
// Enterprise Legal Series — appended once here, not duplicated into
// each document file, so a wording change (or a future Appendix H)
// only has to happen in one place. Applied via withStandardAppendices()
// in registry.ts.
//
// Appendices A, B, D drafted 2026-08-04 from wording supplied directly
// by the user (verbatim or near-verbatim). Appendix C adapted from
// supplied wording — the original referenced a specific section number
// that only made sense for one document, generalized here so it's
// correct regardless of which document's own Contact section it's
// paired with. Appendices E, F, G drafted 2026-08-04 per the user's
// explicit direction to use "legally conservative language... not
// invent certifications, registrations, or operational procedures" —
// each states a general commitment, not a compliance or process claim.
// See TECHNICAL_DEBT_REGISTER.md TD-021 for the full reasoning and
// what these deliberately do NOT claim.

const p = (text: string): LegalContentNode => ({ type: "paragraph", text });

export const STANDARD_APPENDICES: LegalSection[] = [
  {
    id: "appendices",
    number: "Appendix",
    heading: "Appendices",
    level: 1,
    content: [
      p(
        "The following appendices apply as standing provisions across the Ordift Studios Enterprise Legal Series and are incorporated into this document."
      ),
    ],
  },
  {
    id: "appendix-a-interpretation-and-severability",
    number: "Appendix A",
    heading: "Interpretation and Severability",
    level: 2,
    content: [
      p(
        "If any provision of this document is found to be invalid, unlawful, or unenforceable, the remaining provisions will continue in full force and effect to the fullest extent permitted by law."
      ),
    ],
  },
  {
    id: "appendix-b-accessibility-commitment",
    number: "Appendix B",
    heading: "Accessibility Commitment",
    level: 2,
    content: [
      p(
        "Ordift Studios will make reasonable efforts to provide key legal documents in accessible formats upon request, where practicable."
      ),
    ],
  },
  {
    id: "appendix-c-contact-escalation-procedure",
    number: "Appendix C",
    heading: "Contact Escalation Procedure",
    level: 2,
    content: [
      p(
        "Privacy and legal enquiries should follow a documented escalation process to ensure timely handling, identity verification where appropriate, and consistent record-keeping."
      ),
      p("Enquiries may be directed to Ordift Studios using the contact details provided in this document."),
    ],
  },
  {
    id: "appendix-d-cross-document-hierarchy",
    number: "Appendix D",
    heading: "Cross-Document Hierarchy",
    level: 2,
    content: [
      p(
        "Each Ordift Studios publication will clearly state its relationship with other Ordift Studios legal documents. Where a conflict exists, the more specific agreement governing a particular service or engagement will prevail to the extent of the inconsistency."
      ),
    ],
  },
  {
    id: "appendix-e-jurisdiction-specific-data-protection-addendum",
    number: "Appendix E",
    heading: "Jurisdiction-Specific Data Protection Addendum",
    level: 2,
    content: [
      p(
        "Ordift Studios provides services to clients in multiple jurisdictions, including Ghana and Qatar, and may process personal information subject to the data protection laws of those and other jurisdictions in which it operates or provides services."
      ),
      p(
        "Where applicable, Ordift Studios aims to process personal information in a manner consistent with relevant data protection legislation, which may include Ghana's Data Protection Act, Qatar's Personal Data Privacy Protection Law, and, where applicable to a particular client or engagement, the General Data Protection Regulation (GDPR) of the European Union."
      ),
      p(
        "This Appendix is a general statement of approach and does not constitute a representation of certification, accreditation, or registration under any specific law, and does not limit or expand any rights individuals may have under mandatory provisions of applicable law. Whether, and to what extent, a particular law applies depends on the nature of the personal information processed, the parties involved, and the jurisdiction in which processing occurs, and is assessed on a case-by-case basis."
      ),
    ],
  },
  {
    id: "appendix-f-government-and-law-enforcement-requests",
    number: "Appendix F",
    heading: "Government and Law Enforcement Requests",
    level: 2,
    content: [
      p(
        "Ordift Studios responds only to lawful requests for information from courts, regulators, or other competent public authorities, and limits any resulting disclosure to what is legally required."
      ),
      p("Where legally permitted, Ordift Studios will take reasonable steps to verify that a request is valid before responding to it."),
    ],
  },
  {
    id: "appendix-g-data-breach-response-summary",
    number: "Appendix G",
    heading: "Data Breach Response Summary",
    level: 2,
    content: [
      p(
        "In the event of a suspected or confirmed personal data breach, Ordift Studios is committed to investigating the matter, taking reasonable steps to contain and remediate the breach, and notifying affected individuals and/or the relevant regulatory authorities where required by applicable law."
      ),
      p(
        "This Appendix is a summary of Ordift Studios' commitment in principle. It does not describe specific internal procedures, which may be adopted and updated by Ordift Studios from time to time."
      ),
    ],
  },
];

export function withStandardAppendices(doc: LegalDocument): LegalDocument {
  return { ...doc, sections: [...doc.sections, ...STANDARD_APPENDICES] };
}
