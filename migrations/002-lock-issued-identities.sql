-- Apply at production cutover. Reject all bypasses through old clients/functions.
create or replace function public.pasha_guard_quote_identity() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if tg_op='UPDATE' and (new.quotation_number is distinct from old.quotation_number or new.vendor is distinct from old.vendor or new.date_of_issue is distinct from old.date_of_issue or new.id is distinct from old.id or new.creation_key is distinct from old.creation_key) then
  raise exception using errcode='22023',message='The quotation reference, issue date and manufacturer are immutable.';
 end if;
 if current_setting('pasha.managed_quote',true) is distinct from '1' then
  raise exception using errcode='42501',message='Use the current quotation application to save. Manual reference assignment is not permitted.';
 end if;
 return new;
end;$$;
drop trigger if exists pasha_managed_identity on public.quotations;
create trigger pasha_managed_identity before insert or update on public.quotations for each row execute function public.pasha_guard_quote_identity();
drop trigger if exists pasha_managed_identity on quote_qa.quotations;
create trigger pasha_managed_identity before insert or update on quote_qa.quotations for each row execute function public.pasha_guard_quote_identity();

-- Production-only archive protection: obsolete clients cannot allocate outside the registry.
create or replace function public.pasha_legacy_read_only() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin raise exception using errcode='42501',message='The historical archive is read-only. Use the current quotation application.';end;$$;
drop trigger if exists pasha_legacy_read_only on public."Quotation";
create trigger pasha_legacy_read_only before insert or update on public."Quotation" for each row execute function public.pasha_legacy_read_only();
alter table public.quotations enable row level security;
alter table public."Quotation" enable row level security;
revoke all on public.quotations,public."Quotation" from anon,authenticated;
