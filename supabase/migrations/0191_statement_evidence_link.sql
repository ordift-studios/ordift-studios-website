-- 0191: statement-evidence linking (and audited unlink) + original .eml storage.
-- Why: statement evidence columns (bank_evidence_document_id on an instalment and on the acquisition) have existed since 0186 but NOTHING could write them, so a reported payment could never become "verified by statement". And the vault accepted only
-- PDF, JPEG and PNG, so an original e-mail (.eml) could not be kept unaltered.
-- What this adds (two functions, two guard changes, one event type, one storage setting; no new table, no new column, no data change):
--   * public.link_statement_evidence(kind, target, document, evidence, actor): Super Admin only. Links ONE vault statement (PDF/JPEG/PNG of the SAME legal entity, class 'other financial document') to a REPORTED-PAID instalment ('instalment') or to the
--     acquisition's company funding ('funding'). The statement facts are written into the audit event (instrument kind and holder as printed, masked identity, period, line date, amount, currency, description as printed, page, payment reference).
--     It refuses: a personal instrument; an account holder that does not match this legal entity; an unmasked card/account number; a currency or amount different from the reported payment; a line date more than 7 days from the reported payment date or
--     outside the statement period; a payment that is not reported paid; a second link. Nothing is verified by itself: a Super Admin states what the statement shows and the database checks it against the records.
--   * public.unlink_statement_evidence(kind, target, reason, actor): the audited correction (mandatory reason of 10+ characters); the previous link stays in the append-only audit trail; the payment returns to "reported paid, awaiting statement".
--   * the two guards (acquisitions_guard 0186, instalments_guard 0190) change in ONE clause: a link may be cleared only inside unlink_statement_evidence for that very row (a transaction-local setting naming it). Everything else is exactly as before.
--   * the audit-event list gains 'bank_evidence_unlinked' ('bank_evidence_linked' already exists).
--   * the private vault bucket also accepts message/rfc822 (an original e-mail). The application validates that the bytes look like an e-mail message and serves it only as a download.
-- Never created or changed: an expense, a journal entry, a payment, an amount, a date, an ownership record, an asset, a vault document, a financing record. A void (0190) is still refused while a statement is linked; unlink first.
begin;

-- 1. the private vault bucket accepts an original e-mail as well (still private; still 10 MB)
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'message/rfc822'] where id = 'legal-entity-documents';

-- 2. one more audit event type
alter table public.entity_finance_events drop constraint entity_finance_events_event_type_check;
alter table public.entity_finance_events add constraint entity_finance_events_event_type_check
  check (event_type in ('acquisition_recorded', 'financing_recorded', 'instalment_paid', 'classification_decided', 'funding_confirmed', 'bank_evidence_linked', 'voided', 'terms_set', 'payment_recorded', 'payment_voided',
                        'asset_ownership_recorded', 'asset_ownership_voided', 'asset_linked', 'asset_unlinked', 'bank_evidence_unlinked'));

-- 3. the two guards: a statement link can be cleared only by unlink_statement_evidence, for that row
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
    if old.bank_evidence_document_id is not null then
      -- the ONE controlled exception: cleared by unlink_statement_evidence for THIS acquisition (a transaction-local setting naming it), never anywhere else
      if not (new.bank_evidence_document_id is null and current_setting('ordift.unlink_evidence', true) = old.id::text) then raise exception 'bank evidence was already linked' using errcode = '42501'; end if;
    elsif not private.finance_doc_ok(new.bank_evidence_document_id, new.employing_entity_id, array['other_financial_document']) then
      raise exception 'bank evidence must be a financial supporting document in THIS entity''s vault' using errcode = '42501';
    end if;
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
      if old.bank_evidence_document_id is not null then
        -- the ONE controlled exception: cleared by unlink_statement_evidence for THIS instalment (a transaction-local setting naming it), never anywhere else
        if not (new.bank_evidence_document_id is null and current_setting('ordift.unlink_evidence', true) = old.id::text) then raise exception 'bank evidence was already linked' using errcode = '42501'; end if;
      elsif not private.finance_doc_ok(new.bank_evidence_document_id, o.employing_entity_id, array['other_financial_document']) then raise exception 'bank evidence must be a financial supporting document in THIS entity''s vault' using errcode = '42501';
      end if;
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

-- 4. helpers: the holder-name comparison and the "masked identity only" rule
create or replace function private.holder_key(p text) returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g'), '\m(wll|w l l|llc|ltd|limited|co|company|qatar|qsc)\M', ' ', 'g'), '\s+', ' ', 'g'));
$$;
revoke all on function private.holder_key(text) from public, anon, authenticated;
create or replace function private.looks_unmasked(p text) returns boolean language sql immutable set search_path = '' as $$
  -- 12 or more digits in a row once spaces and hyphens are removed, or an IBAN-shaped value: a full card or account number must never be stored here
  select regexp_replace(coalesce(p, ''), '[ -]', '', 'g') ~ '[0-9]{12,}' or regexp_replace(upper(coalesce(p, '')), '[ -]', '', 'g') ~ '[A-Z]{2}[0-9]{2}[A-Z0-9]{11,}';
$$;
revoke all on function private.looks_unmasked(text) from public, anon, authenticated;

-- 5. link
create or replace function public.link_statement_evidence(p_kind text, p_target uuid, p_document uuid, p_evidence jsonb, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ins record; ob record; a record; d record; e record; ev jsonb := coalesce(p_evidence, '{}'::jsonb);
  line_date date; period_from date; period_to date; amt numeric; cur text; target_paid_on date; target_amt numeric; target_cur text; diff integer; holder text; instr_id text; ref text; ref_match boolean := null; matched boolean := false; p record;
begin
  select * into ins from public.entity_financing_instalments limit 0; select * into ob from public.entity_financing_obligations limit 0;      -- assigned (all null) so the funding path can reference them safely
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can link statement evidence' using errcode = '42501'; end if;
  if p_kind not in ('instalment', 'funding') then raise exception 'the statement evidence is for an instalment or for the funding source' using errcode = '42501'; end if;
  -- the statement facts the Super Admin states (all required except page and reference)
  if coalesce(ev ->> 'holderKind', '') <> 'company' then raise exception 'only a COMPANY instrument can be linked: a personal account or card is never attached to a company entity' using errcode = '42501'; end if;
  if coalesce(ev ->> 'instrumentKind', '') not in ('credit_card', 'bank_account') then raise exception 'say whether the statement is for a credit card or a bank account' using errcode = '42501'; end if;
  holder := btrim(coalesce(ev ->> 'accountHolderAsPrinted', '')); instr_id := btrim(coalesce(ev ->> 'instrumentIdentityAsPrinted', '')); ref := nullif(btrim(coalesce(ev ->> 'paymentReference', '')), '');
  if char_length(holder) < 3 or char_length(holder) > 200 then raise exception 'enter the account holder exactly as printed on the statement' using errcode = '42501'; end if;
  if char_length(instr_id) < 3 or char_length(instr_id) > 60 then raise exception 'enter the masked card or account identity as printed (for example the last four digits)' using errcode = '42501'; end if;
  if private.looks_unmasked(instr_id) or private.looks_unmasked(coalesce(ev ->> 'cardholderAsPrinted', '')) or private.looks_unmasked(coalesce(ev ->> 'lineDescriptionAsPrinted', '')) or private.looks_unmasked(coalesce(ref, '')) then
    raise exception 'a full card or account number must not be entered: use the masked identity only' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(ev ->> 'lineDescriptionAsPrinted', ''))) < 3 or char_length(ev ->> 'lineDescriptionAsPrinted') > 200 then raise exception 'enter the statement line description exactly as printed' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(ev ->> 'basisNote', ''))) < 10 or char_length(ev ->> 'basisNote') > 500 then raise exception 'say how the statement line was identified (10 to 500 characters)' using errcode = '42501'; end if;
  if ref is not null and char_length(ref) > 80 then raise exception 'the payment reference is too long' using errcode = '42501'; end if;
  begin line_date := (ev ->> 'lineDate')::date; period_from := (ev ->> 'periodFrom')::date; period_to := (ev ->> 'periodTo')::date; amt := (ev ->> 'lineAmount')::numeric;
  exception when others then raise exception 'the statement line date, the statement period and the amount must be valid' using errcode = '42501'; end;
  cur := upper(coalesce(ev ->> 'lineCurrency', ''));
  if line_date is null or period_from is null or period_to is null or amt is null or amt <= 0 or cur !~ '^[A-Z]{3}$' then raise exception 'the statement line date, the statement period, the amount and the currency are required' using errcode = '42501'; end if;
  if period_from > period_to or period_to > current_date then raise exception 'the statement period must be valid and not in the future' using errcode = '42501'; end if;
  if line_date < period_from or line_date > period_to then raise exception 'the statement line date is outside the statement period' using errcode = '42501'; end if;
  select * into d from public.employing_entity_documents where id = p_document;
  if not found or d.document_type <> 'other_financial_document' or d.mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'the statement must be a PDF or image stored as an other financial document in THIS entity''s vault' using errcode = '42501'; end if;

  if p_kind = 'instalment' then
    select * into ins from public.entity_financing_instalments where id = p_target for update;
    if not found then raise exception 'that instalment does not exist' using errcode = '42501'; end if;
    select * into ob from public.entity_financing_obligations where id = ins.obligation_id;
    select * into a from public.entity_equipment_acquisitions where id = ob.acquisition_id for update;
    if ob.status = 'void' or a.status <> 'recorded' then raise exception 'that instalment belongs to a voided record' using errcode = '42501'; end if;
    if ins.status <> 'paid' then raise exception 'only an instalment that is reported paid can be linked to a statement' using errcode = '42501'; end if;
    if ins.bank_evidence_document_id is not null then raise exception 'a statement is already linked to this instalment: unlink it first, with a reason' using errcode = '42501'; end if;
    target_paid_on := ins.paid_on; target_amt := ins.paid_amount; target_cur := ob.currency;
  else
    select * into a from public.entity_equipment_acquisitions where id = p_target for update;
    if not found or a.status <> 'recorded' then raise exception 'that acquisition is not a recorded acquisition' using errcode = '42501'; end if;
    if a.funding_source_status <> 'company_account' then raise exception 'only a company-account funding source can be linked to a company statement' using errcode = '42501'; end if;
    if a.bank_evidence_document_id is not null then raise exception 'a statement is already linked to this funding source: unlink it first, with a reason' using errcode = '42501'; end if;
    -- the line must be one of the REPORTED payments of this purchase (an instalment marked paid, or a recorded direct payment)
    for p in select i.paid_amount as amount, i.paid_on as paid_on, o.currency as currency from public.entity_financing_instalments i join public.entity_financing_obligations o on o.id = i.obligation_id
               where o.acquisition_id = a.id and o.status <> 'void' and i.status = 'paid'
             union all select x.amount, x.paid_on, x.currency from public.entity_acquisition_payments x where x.acquisition_id = a.id and x.status = 'recorded' loop
      if p.amount = amt and p.currency = cur and abs(line_date - p.paid_on) <= 7 then matched := true; exit; end if;
    end loop;
    if not matched then raise exception 'the statement line does not match any reported payment of this purchase (same amount and currency, within 7 days of the reported date)' using errcode = '42501'; end if;
    target_paid_on := null; target_amt := amt; target_cur := cur;
  end if;

  select * into e from public.employing_entities where id = a.employing_entity_id;
  if d.employing_entity_id <> a.employing_entity_id then raise exception 'the statement must be in THIS entity''s vault' using errcode = '42501'; end if;
  if private.holder_key(holder) = '' or (private.holder_key(holder) <> private.holder_key(e.legal_name) and private.holder_key(holder) <> private.holder_key(e.name)) then
    raise exception 'the account holder on the statement does not match this legal entity: an instrument in another name (for example the Founder personally) is never attached to a company entity' using errcode = '42501'; end if;
  if cur <> target_cur then raise exception 'the statement currency (%) differs from the reported payment currency (%)', cur, target_cur using errcode = '42501'; end if;
  if p_kind = 'instalment' then
    if amt <> target_amt then raise exception 'the statement amount (%) differs from the reported payment (%): a variance is not linked here', amt, target_amt using errcode = '42501'; end if;
    if abs(line_date - target_paid_on) > 7 then raise exception 'the statement line date is more than 7 days from the reported payment date (%): it does not support that payment', target_paid_on using errcode = '42501'; end if;
    diff := line_date - target_paid_on;
  end if;
  if ref is not null and p_kind = 'instalment' then ref_match := (regexp_replace(upper(ref), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(ob.provider_reference), '[^A-Z0-9]', '', 'g')); end if;

  if p_kind = 'instalment' then update public.entity_financing_instalments set bank_evidence_document_id = p_document where id = ins.id;
  else update public.entity_equipment_acquisitions set bank_evidence_document_id = p_document where id = a.id; end if;
  insert into public.entity_finance_events (employing_entity_id, acquisition_id, obligation_id, instalment_id, event_type, actor_profile_id, detail)
    values (a.employing_entity_id, a.id, case when p_kind = 'instalment' then ob.id end, case when p_kind = 'instalment' then ins.id end, 'bank_evidence_linked', p_actor,
      jsonb_build_object('kind', p_kind, 'statementDocumentId', p_document, 'holderKind', 'company', 'instrumentKind', ev ->> 'instrumentKind', 'accountHolderAsPrinted', holder, 'cardholderAsPrinted', nullif(btrim(coalesce(ev ->> 'cardholderAsPrinted', '')), ''),
        'instrumentIdentityAsPrinted', instr_id, 'periodFrom', period_from, 'periodTo', period_to, 'lineDate', line_date, 'lineAmount', amt, 'currency', cur, 'lineDescriptionAsPrinted', btrim(ev ->> 'lineDescriptionAsPrinted'),
        'page', nullif(ev ->> 'page', ''), 'paymentReference', ref, 'referenceMatchesFinancing', ref_match, 'reportedPaidOn', target_paid_on, 'dateDifferenceDays', diff, 'basisNote', btrim(ev ->> 'basisNote'), 'verifiedAgainst', 'the Super Admin stated these statement facts; the database checked entity, holder, currency, amount and date against the records'));
end $$;
revoke all on function public.link_statement_evidence(text, uuid, uuid, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.link_statement_evidence(text, uuid, uuid, jsonb, uuid) to service_role;

-- 6. unlink (the correction path; the link stays in the append-only audit trail)
create or replace function public.unlink_statement_evidence(p_kind text, p_target uuid, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ins record; ob record; a record; prev uuid; r text := btrim(coalesce(p_reason, ''));
begin
  select * into ins from public.entity_financing_instalments limit 0; select * into ob from public.entity_financing_obligations limit 0;
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can unlink statement evidence' using errcode = '42501'; end if;
  if char_length(r) < 10 then raise exception 'a written reason of at least 10 characters is required' using errcode = '42501'; end if;
  if p_kind not in ('instalment', 'funding') then raise exception 'the statement evidence is for an instalment or for the funding source' using errcode = '42501'; end if;
  if p_kind = 'instalment' then
    select * into ins from public.entity_financing_instalments where id = p_target for update;
    if not found or ins.bank_evidence_document_id is null then raise exception 'no statement is linked to that instalment' using errcode = '42501'; end if;
    select * into ob from public.entity_financing_obligations where id = ins.obligation_id;
    select * into a from public.entity_equipment_acquisitions where id = ob.acquisition_id for update;
    prev := ins.bank_evidence_document_id;
    perform set_config('ordift.unlink_evidence', ins.id::text, true);
    update public.entity_financing_instalments set bank_evidence_document_id = null where id = ins.id;
  else
    select * into a from public.entity_equipment_acquisitions where id = p_target for update;
    if not found or a.bank_evidence_document_id is null then raise exception 'no statement is linked to that funding source' using errcode = '42501'; end if;
    prev := a.bank_evidence_document_id;
    perform set_config('ordift.unlink_evidence', a.id::text, true);
    update public.entity_equipment_acquisitions set bank_evidence_document_id = null where id = a.id;
  end if;
  perform set_config('ordift.unlink_evidence', '', true);
  insert into public.entity_finance_events (employing_entity_id, acquisition_id, obligation_id, instalment_id, event_type, actor_profile_id, detail)
    values (a.employing_entity_id, a.id, case when p_kind = 'instalment' then ob.id end, case when p_kind = 'instalment' then ins.id end, 'bank_evidence_unlinked', p_actor, jsonb_build_object('kind', p_kind, 'previousStatementDocumentId', prev, 'reason', r));
end $$;
revoke all on function public.unlink_statement_evidence(text, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.unlink_statement_evidence(text, uuid, text, uuid) to service_role;

commit;
