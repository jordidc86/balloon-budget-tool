-- Additive preparation. Revoke obsolete RPCs with migration 004 at release.
-- Old documents remain unassigned until the owner supplies an explicit mapping.
create table if not exists public.quotation_members (
 user_id uuid primary key references auth.users(id) on delete restrict,
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.quotation_members enable row level security;
revoke all on public.quotation_members from public,anon,authenticated;
alter table public.quotations add column if not exists owner_id uuid references auth.users(id) on delete restrict;
alter table quote_qa.quotations add column if not exists owner_id uuid references auth.users(id) on delete restrict;
create index if not exists quotations_owner_id on public.quotations(owner_id);
create index if not exists qa_quotations_owner_id on quote_qa.quotations(owner_id);

create or replace function public.pasha_guard_quote_identity() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if tg_op='UPDATE' and (new.quotation_number is distinct from old.quotation_number or new.vendor is distinct from old.vendor or new.date_of_issue is distinct from old.date_of_issue or new.id is distinct from old.id or new.creation_key is distinct from old.creation_key) then
  raise exception using errcode='22023',message='The quotation reference, issue date and manufacturer are immutable.';
 end if;
 if tg_op='UPDATE' and new.owner_id is distinct from old.owner_id and (old.owner_id is not null or current_setting('pasha.assign_owner',true) is distinct from '1') then
  raise exception using errcode='22023',message='Quotation ownership cannot be changed.';
 end if;
 if current_setting('pasha.managed_quote',true) is distinct from '1' then
  raise exception using errcode='42501',message='Use the current quotation application to save.';
 end if;
 return new;
end;$$;

create or replace function public.pasha_member_access(p_user_id uuid,p_test boolean default false) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.quotation_members where user_id=p_user_id and enabled);
$$;

create or replace function public.pasha_private_quote(p_user_id uuid,p_id uuid default null,p_vendor text default null,p_number text default null,p_date date default null,p_creation_key uuid default null,p_test boolean default false) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s text:=case when p_test then 'quote_qa' else 'public' end;r jsonb;
begin
 if not public.pasha_member_access(p_user_id) then return null;end if;
 execute format('select to_jsonb(q) from %I.quotations q where owner_id=$1 and (($2 is not null and id=$2) or ($2 is null and $3 is not null and creation_key=$3) or ($2 is null and $3 is null and vendor=$4 and quotation_number=$5 and date_of_issue=$6)) limit 1',s)
 into r using p_user_id,p_id,p_creation_key,p_vendor,p_number,p_date;
 return case when r is null then null else public.pasha_quote_document(r) end;
end;$$;

create or replace function public.pasha_private_save(p_user_id uuid,p_document jsonb,p_creation_key uuid default null,p_id uuid default null,p_expected_revision integer default null,p_test boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s text:=case when p_test then 'quote_qa' else 'public' end;r jsonb;existing_owner uuid;affected bigint;
begin
 if not public.pasha_member_access(p_user_id) then raise exception using errcode='42501',message='Representative access is not enabled.';end if;
 if p_id is not null then
  execute format('select owner_id from %I.quotations where id=$1 for update',s) into existing_owner using p_id;
  if existing_owner is distinct from p_user_id then raise exception using errcode='P0002',message='Quotation not found.';end if;
 else
  if p_creation_key is null then raise exception using errcode='22023',message='A persistent draft key is required.';end if;
  perform pg_advisory_xact_lock(hashtextextended(s||p_creation_key::text,0));
  execute format('select owner_id from %I.quotations where creation_key=$1',s) into existing_owner using p_creation_key;
  get diagnostics affected = row_count;
  if affected>0 and existing_owner is distinct from p_user_id then raise exception using errcode='P0002',message='Quotation not found.';end if;
 end if;
 r:=public.pasha_save_quote(p_document,p_creation_key,p_id,p_expected_revision,p_test);
 if p_id is null then
  perform set_config('pasha.assign_owner','1',true);
  execute format('update %I.quotations set owner_id=$1 where id=$2 and owner_id is null',s) using p_user_id,(r->>'id')::uuid;
 end if;
 return r;
end;$$;

create or replace function public.pasha_private_history(p_user_id uuid,p_id uuid,p_before integer default null,p_test boolean default false) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s text:=case when p_test then 'quote_qa' else 'public' end;rows jsonb;
begin
 if public.pasha_private_quote(p_user_id,p_id,p_test=>p_test) is null then raise exception using errcode='P0002',message='Quotation not found.';end if;
 execute format('select coalesce(jsonb_agg(jsonb_build_object(''revision'',revision,''savedAt'',saved_at,''document'',document) order by revision desc),''[]''::jsonb) from (select * from %I.quotation_versions where quotation_id=$1 and ($2 is null or revision<$2) order by revision desc limit 21) v',s) into rows using p_id,p_before;
 return jsonb_build_object('versions',case when jsonb_array_length(rows)>20 then rows-20 else rows end,'hasMore',jsonb_array_length(rows)>20);
end;$$;

revoke execute on function public.pasha_member_access(uuid,boolean),public.pasha_private_quote(uuid,uuid,text,text,date,uuid,boolean),public.pasha_private_save(uuid,jsonb,uuid,uuid,integer,boolean),public.pasha_private_history(uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.pasha_member_access(uuid,boolean),public.pasha_private_quote(uuid,uuid,text,text,date,uuid,boolean),public.pasha_private_save(uuid,jsonb,uuid,uuid,integer,boolean),public.pasha_private_history(uuid,uuid,integer,boolean) to service_role;
notify pgrst,'reload schema';
