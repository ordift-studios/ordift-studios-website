import type { AgreementReadinessInput } from "./agreementReadiness";

// OS-LGL-010 v1.0 and Kwaku's requisition EXACTLY as recorded in Production (2026-10-22).
export const recorded: AgreementReadinessInput = {
  code: "OS-LGL-010",
  title: "Instructor / Workshop Facilitator Agreement",
  version: {
    status: "approved", approvedBy: "Legal Counsel", approvedAt: null, activatedAt: null, effectiveDate: null, contentReference: null, documentHash: null,
    masterDocxSha256: "1c68433532061921f6e1b5ea776186c5d31ec8e27d4a2a8863ab3454aecc6034", masterPdfSha256: "7014db603d2f08e8cf2b74c8df7a8fceaecb0085a5099fe4932871f4ffd1cf1f",
    masterDocxPath: "masters-docx/OS-LGL-010/OS-LGL-010_Instructor_Workshop_Facilitator_Agreement_Official_Master_v1.0.docx",
    masterPdfPath: "masters-pdf/OS-LGL-010/OS-LGL-010_Instructor_Workshop_Facilitator_Agreement_Official_Master_v1.0.pdf",
    createdAt: "2026-09-08T01:36:30.360932Z", ingestedAt: "2026-09-08T02:24:39.647791Z",
  },
  jurisdictionName: "Ghana",
  jurisdictionSource: "the Founder-approved requisition",
  recordedEntityId: "gh",
  confirmedEntityId: null,
  entityCandidates: [
    { id: "gh", name: "Ordift Studios", jurisdiction: "Ghana", verified: true, signatories: [], documents: [{ id: "d1", type: "Business Registration Certificate", filename: null, hasStoredFile: false, notes: "Ordift Studios Ghana Certificate of Registration — issued 7 May 2018." }], href: "/admin/organization/legal-entities/gh" },
    { id: "qa", name: "Ordift Studios (Qatar)", jurisdiction: "Qatar", verified: true, signatories: [{ id: "s1", fullName: "Myredlive Anim-Tetey", position: "Owner", authority: "Full and absolute authority", sourceDocumentId: "d9", profileId: null }], documents: [], href: "/admin/organization/legal-entities/qa" },
  ],
  versionId: "v1",
  registrationCheck: null,
  selectedSignatoryId: null,
  founder: { profileId: "f1", name: "Myredlive Anim-Tetey", memberNumber: "0001" },
  attestation: null,
  legalHref: "/admin/legal",
};
