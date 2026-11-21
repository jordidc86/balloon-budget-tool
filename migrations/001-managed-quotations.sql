-- Additive migration: preserves existing references and historical amounts.
create schema if not exists quote_qa;
alter table public.quotations add column if not exists creation_key uuid;
alter table public.quotations add column if not exists revision integer not null default 1;
alter table public.quotations add column if not exists fingerprint text;
create unique index if not exists quotations_creation_key_unique on public.quotations(creation_key) where creation_key is not null;
create unique index if not exists quotations_reference_unique on public.quotations(quotation_number);
create table if not exists public.quotation_counters (year integer primary key,last_value integer not null check(last_value>=0));
create table if not exists public.quotation_registry (reference text primary key,year integer not null,sequence integer not null,quotation_id uuid,source text not null,issued_at timestamptz not null default now(),unique(year,sequence));
create table if not exists public.quotation_versions (quotation_id uuid not null,revision integer not null,document jsonb not null,saved_at timestamptz not null default now(),primary key(quotation_id,revision));
alter table public.quotation_counters enable row level security;
alter table public.quotation_registry enable row level security;
alter table public.quotation_versions enable row level security;
revoke all on public.quotation_counters,public.quotation_registry,public.quotation_versions from anon,authenticated;
create table if not exists quote_qa.quotations (like public.quotations including defaults including constraints including indexes);
create table if not exists quote_qa.quotation_counters (like public.quotation_counters including all);
create table if not exists quote_qa.quotation_registry (like public.quotation_registry including all);
create table if not exists quote_qa.quotation_versions (like public.quotation_versions including all);
revoke all on schema quote_qa from public,anon,authenticated;

create or replace function public.pasha_quote_document(r jsonb) returns jsonb language sql immutable set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',r->>'id','vendor',r->>'vendor','quotationNumber',r->>'quotation_number','dateOfIssue',r->>'date_of_issue',
 'customerData',coalesce(r->'customer_data',jsonb_build_object('name',r->>'customer_name','country',r->>'customer_country','contactPerson',r->>'contact_person','phone',r->>'customer_phone','email',r->>'customer_email')),
 'conditions',coalesce(r->>'conditions',''),'discount',coalesce((r->>'discount_percent')::numeric,0),'grossTotal',(r->>'gross_total')::numeric,'netTotal',(r->>'net_total')::numeric,
 'items',r->'items','revision',coalesce((r->>'revision')::integer,1),'createdAt',r->>'created_at','updatedAt',r->>'updated_at');
$$;
revoke execute on function public.pasha_quote_document(jsonb) from public,anon,authenticated;

create or replace function public.pasha_read_quote(p_vendor text,p_number text,p_date date,p_test boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s text:=case when p_test then 'quote_qa' else 'public' end;r jsonb;
begin
 execute format('select to_jsonb(q) from %I.quotations q where vendor=$1 and quotation_number=$2 and date_of_issue=$3',s) into r using p_vendor,p_number,p_date;
 return case when r is null then null else public.pasha_quote_document(r) end;
end;$$;

create or replace function public.pasha_read_quote_id(p_id uuid,p_test boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s text:=case when p_test then 'quote_qa' else 'public' end;r jsonb;
begin execute format('select to_jsonb(q) from %I.quotations q where id=$1',s) into r using p_id;
return case when r is null then null else public.pasha_quote_document(r) end;end;$$;

create or replace function public.pasha_save_quote(p_document jsonb,p_creation_key uuid default null,p_id uuid default null,p_expected_revision integer default null,p_test boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 s text:=case when p_test then 'quote_qa' else 'public' end; r jsonb; existing jsonb; issued date:=(now() at time zone 'Europe/Madrid')::date;
 sequence_year integer:=extract(year from issued); seq integer; ref text; uid uuid; rev integer; fp text:=md5(p_document::text);
 gross numeric:=0;net numeric;discount numeric; line jsonb;price numeric;quantity numeric;customer jsonb:=p_document->'customerData';doc jsonb;
begin
 if p_document ? 'quotationNumber' or p_document ? 'dateOfIssue' then raise exception using errcode='22023',message='References and issue dates are assigned by the database.';end if;
 if p_document->>'vendor' not in ('PASHA','SCHROEDER') or p_document->>'vendor' is null then raise exception using errcode='22023',message='Invalid manufacturer.';end if;
 if jsonb_typeof(p_document->'items') is distinct from 'array' or jsonb_array_length(p_document->'items')=0 or jsonb_array_length(p_document->'items')>300 then raise exception using errcode='22023',message='Items are required.';end if;
 if coalesce(trim(customer->>'name'),'')='' then raise exception using errcode='22023',message='Client name is required.';end if;
 discount:=(p_document->>'discount')::numeric;
 if discount is null or discount<0 or discount>100 then raise exception using errcode='22023',message='Discount must be between 0 and 100.';end if;
 for line in select value from jsonb_array_elements(p_document->'items') loop
  quantity:=(line->>'quantity')::numeric;price:=coalesce((line->>'customPrice')::numeric,(line->'item'->>'price')::numeric);
  if quantity is null or quantity<=0 or quantity>10000 or price is null or price<0 or price>10000000 then raise exception using errcode='22023',message='Invalid item price or quantity.';end if;
  gross:=gross+round(price*quantity,2);
 end loop;
 net:=round(gross*(100-discount)/100,2);
 if p_id is null then
  if p_creation_key is null then raise exception using errcode='22023',message='A persistent creation key is required.';end if;
  perform pg_advisory_xact_lock(hashtextextended(s||p_creation_key::text,0));
  execute format('select to_jsonb(q) from %I.quotations q where creation_key=$1',s) into existing using p_creation_key;
  if existing is not null then
   if existing->>'fingerprint' is distinct from fp then raise exception using errcode='PT409',message='This draft was already saved with different contents. Reload the saved quotation before editing.';end if;
   return public.pasha_quote_document(existing)||jsonb_build_object('replayed',true);
  end if;
  execute format('insert into %I.quotation_counters(year,last_value) values($1,1) on conflict(year) do update set last_value=%I.quotation_counters.last_value+1 returning last_value',s,s) into seq using sequence_year;
  ref:=(case when p_test then 'QA-' else '' end)||sequence_year::text||'-'||lpad(seq::text,greatest(3,length(seq::text)),'0');uid:=gen_random_uuid();rev:=1;
  perform set_config('pasha.managed_quote','1',true);
  execute format('insert into %I.quotations(id,vendor,quotation_number,date_of_issue,customer_name,customer_country,contact_person,customer_phone,customer_email,customer_data,conditions,discount_percent,gross_total,net_total,items,payload,source,creation_key,revision,fingerprint) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning to_jsonb(quotations)',s)
   into r using uid,p_document->>'vendor',ref,issued,customer->>'name',customer->>'country',customer->>'contactPerson',customer->>'phone',customer->>'email',customer,p_document->>'conditions',discount,gross,net,p_document->'items',p_document,'pashaquotes-v2',p_creation_key,rev,fp;
  execute format('insert into %I.quotation_registry(reference,year,sequence,quotation_id,source) values($1,$2,$3,$4,$5)',s) using ref,sequence_year,seq,uid,'managed';
 else
  execute format('select to_jsonb(q) from %I.quotations q where id=$1 for update',s) into existing using p_id;
  if existing is null then raise exception using errcode='P0002',message='Quotation not found.';end if;
  if existing->>'vendor' is distinct from p_document->>'vendor' then raise exception using errcode='22023',message='Manufacturer cannot be changed.';end if;
  if p_expected_revision is null or p_expected_revision<>(existing->>'revision')::integer then raise exception using errcode='PT409',message='Another save changed this quotation. Reload it before saving again.';end if;
  uid:=p_id;rev:=(existing->>'revision')::integer+1;
  perform set_config('pasha.managed_quote','1',true);
  execute format('update %I.quotations set customer_name=$2,customer_country=$3,contact_person=$4,customer_phone=$5,customer_email=$6,customer_data=$7,conditions=$8,discount_percent=$9,gross_total=$10,net_total=$11,items=$12,payload=$13,revision=$14,fingerprint=$15,updated_at=now() where id=$1 returning to_jsonb(quotations)',s)
   into r using uid,customer->>'name',customer->>'country',customer->>'contactPerson',customer->>'phone',customer->>'email',customer,p_document->>'conditions',discount,gross,net,p_document->'items',p_document,rev,fp;
 end if;
 doc:=public.pasha_quote_document(r);
 execute format('insert into %I.quotation_versions(quotation_id,revision,document) values($1,$2,$3)',s) using uid,rev,doc;
 return doc;
end;$$;

create or replace function public.pasha_quote_health(p_test boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s text:=case when p_test then 'quote_qa' else 'public' end;n bigint;
begin execute format('select count(*) from %I.quotation_counters',s) into n;
execute format('select count(*) from %I.quotations where revision>=1',s) into n;
return jsonb_build_object('ok',true,'schemaVersion',2,'testMode',p_test);end;$$;

revoke execute on function public.pasha_read_quote(text,text,date,boolean),public.pasha_read_quote_id(uuid,boolean),public.pasha_save_quote(jsonb,uuid,uuid,integer,boolean),public.pasha_quote_health(boolean) from public,anon,authenticated;
grant execute on function public.pasha_read_quote(text,text,date,boolean),public.pasha_read_quote_id(uuid,boolean),public.pasha_save_quote(jsonb,uuid,uuid,integer,boolean),public.pasha_quote_health(boolean) to service_role;
notify pgrst,'reload schema';

create or replace function public.pasha_read_creation_key(p_creation_key uuid,p_test boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s text:=case when p_test then 'quote_qa' else 'public' end;r jsonb;
begin execute format('select to_jsonb(q) from %I.quotations q where creation_key=$1',s) into r using p_creation_key;
return case when r is null then null else public.pasha_quote_document(r) end;end;$$;
revoke execute on function public.pasha_read_creation_key(uuid,boolean) from public,anon,authenticated;
grant execute on function public.pasha_read_creation_key(uuid,boolean) to service_role;
notify pgrst,'reload schema';
