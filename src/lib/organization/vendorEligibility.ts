import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveOnboardingRelationship,
  isVendorEligible,
  describeVendorIneligibility,
  type RelationshipInputs,
  type RelationshipResolution,
} from "@/lib/organization/onboardingRelationship";

// Server-side enforcement of the vendor boundary (2026-10-21). The vendor
// workspace and its actions were reachable for ANY profile id; the only
// thing keeping an individual contributor out of vendor-only operations was
// which link an admin happened to click. These helpers make the rule hold
// independently of UI navigation: every vendor-only server action (and the
// library functions that create vendor profiles / vendor-classified payees /
// vendor framework agreements) resolves the TARGET account's relationship
// from the database and refuses unless it is a genuine, unambiguous vendor.
//
// The decision itself lives in onboardingRelationship.ts (pure, tested);
// this file only loads the facts and throws.

export class VendorEligibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VendorEligibilityError";
  }
}

const GENERIC_FAILURE = "You are not authorized to do this.";

// Used by the vendor actions' catch blocks: a deliberate eligibility/
// ownership refusal explains itself; anything else (including the
// authorization failure thrown by requireVendorAdmin) keeps the
// pre-existing generic message, so no information changes for callers who
// were never authorized in the first place.
export function vendorActionFailureMessage(error: unknown): string {
  return error instanceof VendorEligibilityError ? error.message : GENERIC_FAILURE;
}

export async function loadRelationshipInputs(profileId: string): Promise<RelationshipInputs> {
  const admin = createAdminClient();
  const [{ data: roleRows }, { data: staffDetails }, { data: onboarding }] = await Promise.all([
    admin.from("user_roles").select("roles(slug)").eq("user_id", profileId),
    admin.from("staff_details").select("engagement_types(slug)").eq("id", profileId).maybeSingle(),
    admin.from("staff_onboarding").select("pipeline").eq("profile_id", profileId).maybeSingle(),
  ]);

  const roles = (roleRows ?? [])
    .map((r) => (r.roles as unknown as { slug: string } | null)?.slug)
    .filter((slug): slug is string => Boolean(slug));
  const engagementType = staffDetails?.engagement_types as unknown as { slug: string } | null | undefined;
  const pipeline = onboarding?.pipeline === "employee" || onboarding?.pipeline === "external_contractor" ? onboarding.pipeline : null;

  return { engagementTypeSlug: engagementType?.slug ?? null, roles, pipeline };
}

export async function resolveRelationshipForProfile(profileId: string): Promise<RelationshipResolution> {
  return resolveOnboardingRelationship(await loadRelationshipInputs(profileId));
}

// Throws VendorEligibilityError unless the target is a clean vendor.
export async function assertVendorEligible(profileId: string): Promise<void> {
  if (!profileId) throw new VendorEligibilityError("No vendor account was specified.");
  const resolution = await resolveRelationshipForProfile(profileId);
  if (!isVendorEligible(resolution)) throw new VendorEligibilityError(describeVendorIneligibility(resolution));
}

// Narrower rule used ONLY for the payee-category check in createPayeeProfile():
// a "vendor" payee category is refused when the account is positively an
// individual contributor or has a conflicting classification. Accounts with
// no contributor signal (e.g. an external supplier contact whose Vendor role
// has not been granted yet) are left to Finance's existing judgement, so
// this does not break Payables for genuine suppliers.
export async function assertVendorPayeeCategoryAllowed(profileId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const resolution = await resolveRelationshipForProfile(profileId);
  if (resolution.relationship === "individual_contributor" || resolution.relationship === "conflict") {
    return {
      ok: false,
      error:
        resolution.relationship === "conflict"
          ? describeVendorIneligibility(resolution)
          : "The Vendor payee category cannot be assigned to an individual contributor or contractor (for example an instructor). Use the Instructor, Contractor or Freelancer category instead.",
    };
  }
  return { ok: true };
}

// ----------------------------------------------------------------------
// Ownership checks — an eligible vendor id must not be usable as a "key" to
// operate on someone else's onboarding record, document or agreement by
// pairing it with a foreign id.
// ----------------------------------------------------------------------
export async function assertOnboardingBelongsToVendor(onboardingId: string, vendorId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from("staff_onboarding").select("profile_id").eq("id", onboardingId).maybeSingle();
  if (!data || data.profile_id !== vendorId) throw new VendorEligibilityError("This onboarding record does not belong to this vendor.");
}

export async function assertAgreementBelongsToVendor(agreementId: string, vendorId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("agreement_parties")
    .select("id")
    .eq("agreement_id", agreementId)
    .eq("party_role", "vendor")
    .eq("profile_id", vendorId)
    .limit(1)
    .maybeSingle();
  if (!data) throw new VendorEligibilityError("This agreement does not belong to this vendor.");
}

export async function assertAmendmentBelongsToVendor(amendmentId: string, vendorId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from("agreement_amendments").select("agreement_id").eq("id", amendmentId).maybeSingle();
  if (!data) throw new VendorEligibilityError("This variation does not belong to this vendor.");
  await assertAgreementBelongsToVendor(data.agreement_id as string, vendorId);
}

export async function assertDocumentBelongsToVendor(documentId: string, vendorId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from("vendor_documents").select("vendor_profile_id").eq("id", documentId).maybeSingle();
  if (!data || data.vendor_profile_id !== vendorId) throw new VendorEligibilityError("This document does not belong to this vendor.");
}
