-- PROPOSAL v2 (NOT a numbered migration, NOT applied anywhere, OPTIONAL, defence in depth): one cost cannot be counted both as an equipment acquisition and as an expense.
-- Depends on migration 0186 (live since 2026-11-10: entity_equipment_acquisitions, entity_financing_obligations, entity_financing_instalments). It adds TWO new before-insert triggers; no existing row, column or
-- constraint changes, and no existing trigger is replaced. Rollback: ROLLBACK_optional_duplicate_expense_guard.sql (drops both triggers and both functions; no data change).
-- Recommended order: first the application-level check (src/lib/organization/financeOverlap.ts, no migration, friendly messages); this trigger pair only protects against a write that bypasses the application.
--
-- What counts as "the same cost" (conservative; a false refusal is fixed by voiding/correcting, a false acceptance double-counts money):
--   1. the SAME stored document (same row) backs both: the acquisition's invoice, its financing confirmation, an instalment's evidence, or its statement evidence  <->  an expense's source document;
--   2. the SAME invoice: same entity, same number (trimmed, case-insensitive) AND same supplier / issuing authority (trimmed, case-insensitive).
-- Copies of the same bytes filed as another row are caught by the application check (it knows the file hashes); the trigger stays exact so it cannot refuse unrelated costs.
begin;

create or replace function private.expense_not_an_acquisition() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'recorded' and (
       exists (select 1 from public.entity_equipment_acquisitions a where a.employing_entity_id = new.employing_entity_id and a.status = 'recorded' and (
                 (new.source_document_id is not null and new.source_document_id in (a.invoice_document_id, a.bank_evidence_document_id))
                 or (lower(btrim(a.invoice_number)) = lower(btrim(new.receipt_number)) and lower(btrim(a.supplier_name)) = lower(btrim(new.issuing_authority)))))
    or (new.source_document_id is not null and exists (
         select 1 from public.entity_financing_obligations o left join public.entity_financing_instalments i on i.obligation_id = o.id
          where o.employing_entity_id = new.employing_entity_id and o.status <> 'void'
            and new.source_document_id in (o.confirmation_document_id, i.evidence_document_id, i.bank_evidence_document_id)))) then
    raise exception 'this invoice or document is already recorded as an equipment acquisition or its financing; it cannot also be recorded as an expense' using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function private.expense_not_an_acquisition() from public, anon, authenticated;
create trigger entity_expenses_not_an_acquisition before insert on public.entity_expenses for each row execute function private.expense_not_an_acquisition();

create or replace function private.acquisition_not_an_expense() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.entity_expenses e where e.employing_entity_id = new.employing_entity_id and e.status = 'recorded' and (
               e.source_document_id in (new.invoice_document_id, new.bank_evidence_document_id)
               or (lower(btrim(e.receipt_number)) = lower(btrim(new.invoice_number)) and lower(btrim(e.issuing_authority)) = lower(btrim(new.supplier_name))))) then
    raise exception 'this invoice or document is already recorded as an expense; it cannot also be recorded as an equipment acquisition' using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function private.acquisition_not_an_expense() from public, anon, authenticated;
create trigger acquisitions_not_an_expense before insert on public.entity_equipment_acquisitions for each row execute function private.acquisition_not_an_expense();

commit;
