"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import {
  addContactEmail, createContact, createContactFromRecord, createOrganisationRecord, linkContactToAccount, linkRecord, parseAddressList, removeContactEmail,
  setEmailShared, setPrimaryEmail, unlinkContactFromAccount, unlinkRecord, updateContact, type RecordSubject,
} from "@/lib/directory/directory";
import { actionFail, actionOk, type ActionState } from "@/lib/shared/actionState";

// Client Directory v1 — thin Server Action wrappers (same pattern as the supplier-approval and partnerships actions): resolve the signed-in user,
// call the governed lib function (which re-checks authorisation itself and writes the audit log), revalidate. Nothing here links, merges or
// backfills anything on its own, reads a mailbox, or touches a stage, quotation status, payment or financial record.

async function actor() {
  const user = await getCurrentUser();
  return user ? { id: user.id } : null;
}

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "");
const optional = (formData: FormData, key: string) => (String(formData.get(key) ?? "").trim() || null);
const lines = (raw: string) => raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);

function subjectFrom(formData: FormData): RecordSubject | null {
  const type = str(formData, "subjectType");
  const id = str(formData, "subjectId");
  return (type === "enquiry" || type === "quotation") && id ? { type, id } : null;
}

function revalidateSubject(subject: RecordSubject) {
  revalidatePath(subject.type === "enquiry" ? `/admin/enquiries/${subject.id}` : `/admin/pricing/quotations/${subject.id}`);
  revalidatePath("/admin/organisations/link-enquiries");
  revalidatePath("/admin/organisations/contacts");
  revalidatePath("/admin/organisations");
}

export async function createContactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const result = await createContact({
    fullName: str(formData, "fullName"),
    jobTitle: optional(formData, "jobTitle"),
    organisationId: optional(formData, "organisationId"),
    emails: parseAddressList(str(formData, "emails")),
    phones: lines(str(formData, "phones")),
    notes: optional(formData, "notes"),
    confirmedDistinct: formData.get("confirmedDistinct") === "on",
    actorUserId: user.id,
  });
  if (!result.ok) return actionFail(result.error);
  revalidatePath("/admin/organisations/contacts");
  revalidatePath("/admin/organisations");
  return actionOk("Contact created.");
}

export async function updateContactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const contactId = str(formData, "contactId");
  const status = str(formData, "status") === "inactive" ? "inactive" : "active";
  const result = await updateContact({
    contactId,
    fullName: str(formData, "fullName"),
    preferredName: optional(formData, "preferredName"),
    jobTitle: optional(formData, "jobTitle"),
    organisationId: optional(formData, "organisationId"),
    phones: lines(str(formData, "phones")),
    notes: optional(formData, "notes"),
    status,
    actorUserId: user.id,
  });
  if (!result.ok) return actionFail(result.error);
  revalidatePath(`/admin/organisations/contacts/${contactId}`);
  revalidatePath("/admin/organisations/contacts");
  return actionOk("Contact saved.");
}

export async function addContactEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const contactId = str(formData, "contactId");
  const sharedChoice = str(formData, "sharing");
  const result = await addContactEmail({ contactId, email: str(formData, "email"), isShared: sharedChoice === "shared" ? true : sharedChoice === "personal" ? false : undefined, actorUserId: user.id });
  if (!result.ok) return actionFail(result.error);
  revalidatePath(`/admin/organisations/contacts/${contactId}`);
  return actionOk("Address added.");
}

export async function removeContactEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const contactId = str(formData, "contactId");
  const result = await removeContactEmail({ contactId, emailId: str(formData, "emailId"), actorUserId: user.id });
  if (!result.ok) return actionFail(result.error);
  revalidatePath(`/admin/organisations/contacts/${contactId}`);
  return actionOk("Address removed.");
}

export async function setPrimaryEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const contactId = str(formData, "contactId");
  const result = await setPrimaryEmail({ contactId, emailId: str(formData, "emailId"), actorUserId: user.id });
  if (!result.ok) return actionFail(result.error);
  revalidatePath(`/admin/organisations/contacts/${contactId}`);
  return actionOk("Primary address changed.");
}

export async function setEmailSharedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const contactId = str(formData, "contactId");
  const result = await setEmailShared({ contactId, emailId: str(formData, "emailId"), shared: str(formData, "shared") === "true", actorUserId: user.id });
  if (!result.ok) return actionFail(result.error);
  revalidatePath(`/admin/organisations/contacts/${contactId}`);
  return actionOk("Address updated.");
}

export async function linkContactAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const contactId = str(formData, "contactId");
  const result = await linkContactToAccount({ contactId, profileId: str(formData, "profileId"), actorUserId: user.id });
  if (!result.ok) return actionFail(result.error);
  revalidatePath(`/admin/organisations/contacts/${contactId}`);
  return actionOk("Portal account linked to this contact.");
}

export async function unlinkContactAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const contactId = str(formData, "contactId");
  const result = await unlinkContactFromAccount({ contactId, actorUserId: user.id });
  if (!result.ok) return actionFail(result.error);
  revalidatePath(`/admin/organisations/contacts/${contactId}`);
  return actionOk("Account link removed.");
}

export async function createOrganisationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const result = await createOrganisationRecord({ name: str(formData, "name"), domain: optional(formData, "domain"), notes: optional(formData, "notes"), confirmedDistinct: formData.get("confirmedDistinct") === "on", actorUserId: user.id });
  if (!result.ok) return actionFail(result.error);
  revalidatePath("/admin/organisations");
  return actionOk("Organisation created.");
}

export async function linkRecordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const subject = subjectFrom(formData);
  if (!subject) return actionFail("Missing record.");
  const result = await linkRecord({ subject, contactId: optional(formData, "contactId"), organisationId: optional(formData, "organisationId"), actorUserId: user.id });
  if (!result.ok) return actionFail(result.error);
  revalidateSubject(subject);
  return actionOk(["Linked.", ...result.notes].join(" "));
}

export async function unlinkRecordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const subject = subjectFrom(formData);
  if (!subject) return actionFail("Missing record.");
  const result = await unlinkRecord({ subject, actorUserId: user.id });
  if (!result.ok) return actionFail(result.error);
  revalidateSubject(subject);
  return actionOk("Link removed.");
}

export async function createContactFromRecordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const subject = subjectFrom(formData);
  if (!subject) return actionFail("Missing record.");
  const result = await createContactFromRecord({ subject, organisationId: optional(formData, "organisationId"), confirmedDistinct: formData.get("confirmedDistinct") === "on", actorUserId: user.id });
  if (!result.ok) return actionFail(result.error);
  revalidateSubject(subject);
  return actionOk("Contact created from this record and linked.");
}
