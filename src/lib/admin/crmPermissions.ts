import type { WorkflowCapabilityMatrix } from "@/lib/workflow/types";

// CRM Lifecycle Automation Phase 1, Batch 1 (2026-08-20) — first
// consumer of the workflow engine's capability system for CRM stage
// edits, following the exact same pattern proven for Payments &
// Finance (src/lib/payments/paymentPermissions.ts). Manual crm_stage
// changes were previously gated only by the flat isStaffOrAdmin()
// check, which let plain staff freely move any enquiry to any stage —
// this matrix narrows that to admin/super_admin only, the same tier
// manage_project_amount already uses, since a stage change (e.g. to
// "Booked" or "Completed") carries real business-reporting weight
// that a routine staff action shouldn't be able to move unilaterally.
//
// Ordinary staff, clients, collaborators, and every other role are
// deliberately absent from this matrix — hasCapability() returns
// false for any role with no entry, so they get no automatic access
// as new roles are added later.
export const CRM_CAPABILITIES: WorkflowCapabilityMatrix = {
  super_admin: ["edit_crm_stage"],
  admin: ["edit_crm_stage"],
};
