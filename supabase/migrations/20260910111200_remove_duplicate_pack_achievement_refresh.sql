drop trigger if exists pack_openings_refresh_achievements on public.pack_openings;

comment on function public.refresh_achievements_after_pack() is
  'Legacy trigger helper retained for rollback compatibility. Pack openings refresh achievements explicitly inside server_open_pack; duplicate trigger removed for performance.';
