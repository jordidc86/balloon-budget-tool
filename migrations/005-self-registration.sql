-- Confirmation is performed by Supabase Auth; never trust browser metadata.
-- A verified self-registered account starts with access to its own documents
-- only. Registration or repeated confirmation cannot reactivate a blocked user.
create or replace function public.pasha_enable_confirmed_representative()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is not null and coalesce(new.is_anonymous,false)=false and coalesce(trim(new.email),'')<>'' then
  insert into public.quotation_members(user_id,enabled) values(new.id,true)
  on conflict(user_id) do nothing;
 end if;
 return new;
end;$$;
revoke all on function public.pasha_enable_confirmed_representative() from public,anon,authenticated;
drop trigger if exists pasha_confirmed_representative on auth.users;
create trigger pasha_confirmed_representative
 after insert or update of email_confirmed_at on auth.users
 for each row execute function public.pasha_enable_confirmed_representative();
