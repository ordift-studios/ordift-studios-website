"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { registerMasterAction, startReviewAction } from "./approvalActions";

const btn = "min-h-11 px-5 rounded-full border border-black/20 font-sans text-body-small text-ordift-ink";
export function StartReviewForm({ versionId }: { versionId: string }) {
  return (<ActionForm action={startReviewAction} className="space-y-2"><input type="hidden" name="versionId" value={versionId} /><SubmitButton pendingLabel="Starting…" className={btn}>Start the legal review</SubmitButton></ActionForm>);
}
export function RegisterMasterForm({ versionId }: { versionId: string }) {
  return (<ActionForm action={registerMasterAction} className="space-y-2"><input type="hidden" name="versionId" value={versionId} /><SubmitButton pendingLabel="Verifying…" className={btn}>Verify and register the stored master</SubmitButton></ActionForm>);
}
