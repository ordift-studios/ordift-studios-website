-- Removes the two sample/test quotations the Founder created during
-- live QA of the Client Quotation feature (2026-09-16), explicitly
-- authorized for removal. Both are status='draft' (never sent/issued —
-- no real commercial history to preserve) and double-keyed on both id
-- and quotation_reference so this can only ever touch these exact two
-- rows. Line items cascade automatically (client_quotation_items
-- .quotation_id ON DELETE CASCADE, migration 0134) — no orphan rows.

begin;

delete from public.client_quotations
where id = 'f48adb5b-7a69-4319-b087-b42d488b0988'
  and quotation_reference = 'ORD-QUO-2026-000001'
  and status = 'draft';

delete from public.client_quotations
where id = '2dec6c57-02f1-4c10-8d15-0eb8e2e9b420'
  and quotation_reference = 'ORD-QUO-2026-000002'
  and status = 'draft';

commit;
