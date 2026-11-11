-- 0190: audited VOID of an equipment acquisition together with its financing and instalments (a correction path; nothing is edited or deleted).
-- Why: 0186 made acquisitions, financing obligations and instalments append-only and designed them to be "voided with a reason and re-recorded", but gave the application no function to do it
-- (only payments, ownership records and asset links can be voided). A wrongly entered purchase could therefore not be corrected: the invoice number and financing reference are unique among LIVE rows.
-- What this adds (ONE function, ONE guard change, ONE constraint relaxation; no new table, no new column, no data change):
--   * public.void_equipment_acquisition(acquisition, reason, actor): Super Admin only; reason of at least 10 characters; one transaction; one audit event ('voided', already an allowed event type) carrying
--     the reason and a snapshot of everything voided (including any REPORTED payment: date, amount, evidence document and note). The acquisition, its obligation and every instalment are KEPT, marked void with the reason.
--   * Refused when: the acquisition is not 'recorded'; it is linked to an asset (unlink first, audited); a bank/card statement has been linked as evidence (the item was reconciled: a different, reasoned process);
--     the financing is already 'settled' (every instalment paid); it is not the Founder-approved Super Admin actor.
--   * Direct payments of a non-financed purchase are voided through the EXISTING audited public.void_acquisition_payment (its own 'payment_voided' events).
--   * Paid instalments can become void ONLY inside that function (a transaction-local setting naming the acquisition) and only while no statement is linked; their payment columns are not changed and stay readable.
--   * The instalment 'paid shape' constraint is relaxed for status 'void' only (a voided row keeps the payment facts it had); every other row is checked exactly as before.
--   * After a void the invoice number and the financing reference become free again (the unique indexes only cover live rows), so a corrected record can be entered. The voided rows stay visible and are excluded from totals.
-- Never created or changed: an expense, an accounting entry, a payment, a statement verification, an asset, an ownership record, a vault document. Nothing is deleted.
begin;

-- 1. a voided instalment may keep the payment facts it had when it was voided (every non-void row keeps the exact 0186 rule)
alter table public.entity_financing_instalments drop constraint instalments_paid_shape;
alter table public.entity_financing_instalments add constraint instalments_paid_shape check (
  status = 'void'
  or ((status = 'paid') = (paid_on is not null and paid_amount is not null and marked_paid_by is not null and marked_paid_at is not null)
      and (status <> 'paid' or evidence_document_id is not null or char_length(btrim(coalesce(evidence_note, ''))) >= 10)));

-- 2. the 0186 instalment guard, with ONE addition: paid -> void, only inside void_equipment_acquisition for THIS acquisition, with a reason, no statement linked, every payment fact unchanged
create or replace function private.instalments_guard() returns trigger language plpgsql set search_path = '' as $$
declare o record;
begin
  if tg_op = 'DELETE' then raise exception 'entity_financing_instalments is append-only' using errcode = '42501'; end if;
  select * into o from public.entity_financing_obligations where id = coalesce(new.obligation_id, old.obligation_id);
  if tg_op = 'INSERT' then
    if new.status = 'paid' and not private.finance_doc_ok(new.evidence_document_id, o.employing_entity_id, array['other_financial_document', 'supplier_invoice', 'purchase_receipt']) and new.evidence_document_id is not null then
      raise exception 'instalment evidence must be a financial document in THIS entity''s vault' using errcode = '42501'; end if;
    if new.sequence > o.instalment_count then raise exception 'the obligation has only % instalments', o.instalment_count using errcode = '42501'; end if;
    return new;
  end if;
  if (new.obligation_id, new.sequence, new.amount, new.expected_month, new.created_at) is distinct from (old.obligation_id, old.sequence, old.amount, old.expected_month, old.created_at) then
    raise exception 'an instalment''s sequence, amount and expected month cannot be edited' using errcode = '42501'; end if;
  if old.status = 'paid' then
    if new.status = 'void' and current_setting('ordift.void_acquisition', true) = o.acquisition_id::text and old.bank_evidence_document_id is null and char_length(btrim(coalesce(new.void_reason, ''))) >= 10
       and (new.paid_on, new.paid_amount, new.evidence_document_id, new.marked_paid_by, new.marked_paid_at, new.evidence_note, new.bank_evidence_document_id)
           is not distinct from (old.paid_on, old.paid_amount, old.evidence_document_id, old.marked_paid_by, old.marked_paid_at, old.evidence_note, old.bank_evidence_document_id) then
      return new; end if;
    if new.status <> 'paid' or (new.paid_on, new.paid_amount, new.evidence_document_id, new.marked_paid_by, new.marked_paid_at, new.evidence_note) is distinct from (old.paid_on, old.paid_amount, old.evidence_document_id, old.marked_paid_by, old.marked_paid_at, old.evidence_note) then
      raise exception 'a paid instalment cannot be changed (only bank evidence may be linked once)' using errcode = '42501'; end if;
    if new.bank_evidence_document_id is distinct from old.bank_evidence_document_id then
      if old.bank_evidence_document_id is not null then raise exception 'bank evidence was already linked' using errcode = '42501'; end if;
      if not private.finance_doc_ok(new.bank_evidence_document_id, o.employing_entity_id, array['other_financial_document']) then raise exception 'bank evidence must be a financial supporting document in THIS entity''s vault' using errcode = '42501'; end if;
    end if;
    return new;
  end if;
  if old.status = 'void' then raise exception 'a voided instalment cannot be changed' using errcode = '42501'; end if;
  if new.status = 'paid' then
    if new.evidence_document_id is not null and not private.finance_doc_ok(new.evidence_document_id, o.employing_entity_id, array['other_financial_document', 'supplier_invoice', 'purchase_receipt']) then
      raise exception 'instalment evidence must be a financial document in THIS entity''s vault' using errcode = '42501'; end if;
    if new.paid_amount <> old.amount then raise exception 'the paid amount (%) must equal the instalment (%)', new.paid_amount, old.amount using errcode = '42501'; end if;
  end if;
  return new;
end $$;
revoke all on function private.instalments_guard() from public, anon, authenticated;

-- 3. the void
create or replace function public.void_equipment_acquisition(p_acquisition uuid, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a record; o record; i record; pay record; r text := btrim(coalesce(p_reason, '')); vi jsonb := '[]'::jsonb; vp integer := 0; had_obligation boolean := false;
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can void an acquisition' using errcode = '42501'; end if;
  if char_length(r) < 10 then raise exception 'a written reason of at least 10 characters is required' using errcode = '42501'; end if;
  select * into a from public.entity_equipment_acquisitions where id = p_acquisition for update;
  if not found or a.status <> 'recorded' then raise exception 'that acquisition is not a recorded acquisition' using errcode = '42501'; end if;
  if a.company_asset_id is not null then raise exception 'this acquisition is linked to an asset: unlink it first (audited), then void it' using errcode = '42501'; end if;
  if a.bank_evidence_document_id is not null then raise exception 'a statement is already linked to this acquisition: it was reconciled and cannot be voided here' using errcode = '42501'; end if;
  select * into o from public.entity_financing_obligations where acquisition_id = a.id and status <> 'void' for update;
  if found then
    had_obligation := true;
    if o.status = 'settled' then raise exception 'the financing is already settled (every instalment paid): it cannot be voided here' using errcode = '42501'; end if;
    if exists (select 1 from public.entity_financing_instalments x where x.obligation_id = o.id and x.bank_evidence_document_id is not null) then
      raise exception 'a statement is already linked to an instalment: it was reconciled and cannot be voided here' using errcode = '42501'; end if;
    perform set_config('ordift.void_acquisition', a.id::text, true);
    for i in select * from public.entity_financing_instalments x where x.obligation_id = o.id and x.status <> 'void' order by x.sequence for update loop
      vi := vi || jsonb_build_array(jsonb_build_object('sequence', i.sequence, 'amount', i.amount, 'wasStatus', i.status, 'paidOn', i.paid_on, 'evidenceDocumentId', i.evidence_document_id, 'evidenceNote', i.evidence_note));
      update public.entity_financing_instalments set status = 'void', void_reason = r where id = i.id;
    end loop;
    perform set_config('ordift.void_acquisition', '', true);
    update public.entity_financing_obligations set status = 'void', void_reason = r where id = o.id;
  end if;
  for pay in select x.id from public.entity_acquisition_payments x where x.acquisition_id = a.id and x.status = 'recorded' order by x.paid_on, x.created_at loop
    perform public.void_acquisition_payment(pay.id, r, p_actor); vp := vp + 1;
  end loop;
  update public.entity_equipment_acquisitions set status = 'void', void_reason = r where id = a.id;
  insert into public.entity_finance_events (employing_entity_id, acquisition_id, obligation_id, event_type, actor_profile_id, detail)
    values (a.employing_entity_id, a.id, case when had_obligation then o.id end, 'voided', p_actor, jsonb_build_object('kind', 'acquisition_void', 'reason', r, 'invoiceNumber', a.invoice_number, 'supplier', a.supplier_name,
      'net', a.net_amount, 'currency', a.currency, 'financingReference', case when had_obligation then o.provider_reference end, 'voidedInstalments', vi, 'voidedPayments', vp));
end $$;
revoke all on function public.void_equipment_acquisition(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.void_equipment_acquisition(uuid, text, uuid) to service_role;

commit;
