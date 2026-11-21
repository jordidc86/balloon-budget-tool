-- Apply atomically with the authenticated production deployment.
-- Obsolete deployments must not bypass the new owner checks.
revoke execute on function public.pasha_read_quote(text,text,date,boolean),public.pasha_read_quote_id(uuid,boolean),public.pasha_read_creation_key(uuid,boolean),public.pasha_save_quote(jsonb,uuid,uuid,integer,boolean) from service_role;
-- Original Prisma deployments queried the historical table using an owner
-- connection. Rename that archive (without deleting data) so those obsolete
-- routes cannot expose it. Modern deployments used REST table access; remove
-- those grants as well. Current private RPCs execute as their database owner.
do $$begin
 if to_regclass('public."Quotation"') is not null then
  if to_regclass('public.pasha_legacy_archive') is not null then raise exception 'Both legacy archive names exist; review before cutover';end if;
  alter table public."Quotation" rename to pasha_legacy_archive;
 end if;
end$$;
revoke all on public.quotations,public.pasha_legacy_archive,public.quotation_counters,public.quotation_registry,public.quotation_versions,public.quotation_members from service_role;
notify pgrst,'reload schema';
