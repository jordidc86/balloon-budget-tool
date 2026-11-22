-- Public signup is disabled in Supabase Auth. The administrator creates users
-- with a password and Auto Confirm User enabled, without requiring SMTP.
create or replace function public.pasha_enroll_confirmed_account()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is not null and coalesce(new.is_anonymous,false)=false and coalesce(trim(new.email),'')<>'' then
  insert into public.quotation_members(user_id,enabled) values(new.id,true)
  on conflict(user_id) do nothing;
 end if;
 return new;
end;$$;
revoke all on function public.pasha_enroll_confirmed_account() from public,anon,authenticated;
drop trigger if exists pasha_enroll_confirmed_account on auth.users;
create trigger pasha_enroll_confirmed_account
 after insert or update of email_confirmed_at on auth.users
 for each row execute function public.pasha_enroll_confirmed_account();
