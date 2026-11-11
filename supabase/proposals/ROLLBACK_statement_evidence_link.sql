-- ROLLBACK for 0191_statement_evidence_link.sql. Refuses if any statement evidence was linked or unlinked (an audit event exists or a link column is set) or an e-mail (message/rfc822) document is stored:
-- those are evidence and must not be orphaned. Restores the 0186 acquisitions guard, the 0190 instalments guard, the 0189 audit-event list and the original storage MIME list, then drops the two functions and two helpers.
begin;
do $$ begin
  if exists (select 1 from public.entity_finance_events where event_type in ('bank_evidence_linked', 'bank_evidence_unlinked'))
     or exists (select 1 from public.entity_equipment_acquisitions where bank_evidence_document_id is not null)
     or exists (select 1 from public.entity_financing_instalments where bank_evidence_document_id is not null)
     or exists (select 1 from public.employing_entity_documents where mime_type = 'message/rfc822') then
    raise exception 'statement evidence was linked/unlinked or an e-mail document is stored; rollback refused (unlink with a reason instead)'; end if; end $$;
drop function if exists public.link_statement_evidence(text, uuid, uuid, jsonb, uuid);
drop function if exists public.unlink_statement_evidence(text, uuid, text, uuid);
drop function if exists private.holder_key(text);
drop function if exists private.looks_unmasked(text);
create or replace function private.acquisitions_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'entity_equipment_acquisitions is append-only: void a mistaken record instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not private.finance_doc_ok(new.invoice_document_id, new.employing_entity_id, array['purchase_receipt', 'supplier_invoice']) then
      raise exception 'the invoice document must be a purchase receipt or supplier invoice in THIS entity''s vault' using errcode = '42501'; end if;
    if new.accounting_classification <> 'pending_professional_review' then raise exception 'a new acquisition starts as pending_professional_review' using errcode = '42501'; end if;
    return new;
  end if;
  if (new.employing_entity_id, new.supplier_name, new.supplier_branch, new.invoice_number, new.purchase_date, new.item_description, new.item_code, new.quantity, new.currency, new.list_price_total,
      new.discount_total, new.net_amount, new.customer_as_shown, new.invoice_document_id, new.recorded_by, new.created_at)
     is distinct from
     (old.employing_entity_id, old.supplier_name, old.supplier_branch, old.invoice_number, old.purchase_date, old.item_description, old.item_code, old.quantity, old.currency, old.list_price_total,
      old.discount_total, old.net_amount, old.customer_as_shown, old.invoice_document_id, old.recorded_by, old.created_at) then
    raise exception 'a recorded acquisition cannot be edited; void it with a reason and record a correction' using errcode = '42501'; end if;
  if old.status = 'void' then raise exception 'a voided acquisition cannot be changed' using errcode = '42501'; end if;
  if old.accounting_classification <> 'pending_professional_review' and new.accounting_classification is distinct from old.accounting_classification then
    raise exception 'the accounting classification was already decided; void and re-record with a reason' using errcode = '42501'; end if;
  if new.bank_evidence_document_id is distinct from old.bank_evidence_document_id then
    if old.bank_evidence_document_id is not null then raise exception 'bank evidence was already linked' using errcode = '42501'; end if;
    if not private.finance_doc_ok(new.bank_evidence_document_id, new.employing_entity_id, array['other_financial_document']) then
      raise exception 'bank evidence must be a financial supporting document in THIS entity''s vault' using errcode = '42501'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.acquisitions_guard() from public, anon, authenticated;
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
alter table public.entity_finance_events drop constraint entity_finance_events_event_type_check;
alter table public.entity_finance_events add constraint entity_finance_events_event_type_check
  check (event_type in ('acquisition_recorded', 'financing_recorded', 'instalment_paid', 'classification_decided', 'funding_confirmed', 'bank_evidence_linked', 'voided', 'terms_set', 'payment_recorded', 'payment_voided',
                        'asset_ownership_recorded', 'asset_ownership_voided', 'asset_linked', 'asset_unlinked'));
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'] where id = 'legal-entity-documents';
commit;
