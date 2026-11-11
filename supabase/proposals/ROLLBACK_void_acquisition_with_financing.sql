-- ROLLBACK for 0190_void_acquisition_with_financing.sql. Refuses if any acquisition was voided through it (an 'acquisition_void' audit event exists) or any voided instalment keeps payment facts that the restored 0186 constraint would reject:
-- voided rows are the correction history and must not be lost. Restores the 0186 instalment guard and constraint exactly, then drops the function.
begin;
do $$ begin
  if exists (select 1 from public.entity_finance_events where event_type = 'voided' and detail ->> 'kind' = 'acquisition_void')
     or exists (select 1 from public.entity_financing_instalments where status = 'void' and (paid_on is not null or paid_amount is not null)) then
    raise exception 'an acquisition was voided through 0190 (or a voided instalment keeps payment facts); rollback refused'; end if; end $$;
drop function if exists public.void_equipment_acquisition(uuid, text, uuid);
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
alter table public.entity_financing_instalments drop constraint instalments_paid_shape;
alter table public.entity_financing_instalments add constraint instalments_paid_shape check (
  (status = 'paid') = (paid_on is not null and paid_amount is not null and marked_paid_by is not null and marked_paid_at is not null)
  and (status <> 'paid' or evidence_document_id is not null or char_length(btrim(coalesce(evidence_note, ''))) >= 10));
commit;
