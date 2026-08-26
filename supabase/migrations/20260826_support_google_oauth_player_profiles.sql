create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  desired_username text;
  generated_base text;
begin
  desired_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');

  if desired_username is null then
    generated_base := coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'given_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'trainer'
    );

    generated_base := regexp_replace(generated_base, '[^a-zA-Z0-9_]+', '_', 'g');
    generated_base := trim(both '_' from generated_base);
    if length(generated_base) < 3 then generated_base := 'trainer'; end if;

    desired_username := left(generated_base, 20) || '_' || substr(new.id::text, 1, 6);
  end if;

  insert into public.players (id, username)
  values (new.id, desired_username);

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;
revoke all on function private.handle_new_user() from anon;
revoke all on function private.handle_new_user() from authenticated;
