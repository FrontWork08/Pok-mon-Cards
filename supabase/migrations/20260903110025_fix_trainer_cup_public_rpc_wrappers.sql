-- Keep tournament internals private while exposing authenticated RPC wrappers.

create or replace function public.get_tournament_hub()
returns jsonb
language sql
security definer
set search_path=''
as $$ select private.get_tournament_hub(); $$;

create or replace function public.join_tournament()
returns jsonb
language sql
security definer
set search_path=''
as $$ select private.join_tournament(); $$;

create or replace function public.leave_tournament()
returns jsonb
language sql
security definer
set search_path=''
as $$ select private.leave_tournament(); $$;

revoke all on function public.get_tournament_hub() from public,anon;
revoke all on function public.join_tournament() from public,anon;
revoke all on function public.leave_tournament() from public,anon;

grant execute on function public.get_tournament_hub() to authenticated,service_role;
grant execute on function public.join_tournament() to authenticated,service_role;
grant execute on function public.leave_tournament() to authenticated,service_role;
