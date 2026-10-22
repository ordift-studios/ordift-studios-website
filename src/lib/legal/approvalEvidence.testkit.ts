import { storeApprovalEvidence } from "./approvalEvidence";

// Stores a small plain-text evidence file for a version through the REAL evidence store (the server computes the fingerprint).
export async function storeTestEvidence(versionId: string, actorUserId: string, text = "Email from counsel, 5 September 2026: I approve OS-LGL-010, the Instructor / Workshop Facilitator Agreement, v1.0. Synthetic test evidence.", name = "counsel-email.txt"): Promise<string> {
  const r = await storeApprovalEvidence({ versionId, filename: name, bytes: new TextEncoder().encode(text), description: "Synthetic counsel email for tests", counselName: "Synthetic Counsel", actorUserId });
  if (!r.ok) throw new Error(`test evidence failed: ${r.error}`);
  return r.item.id;
}
