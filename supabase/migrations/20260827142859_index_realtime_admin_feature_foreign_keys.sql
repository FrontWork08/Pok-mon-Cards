create index if not exists idx_admin_coin_adjustments_admin_id
  on public.admin_coin_adjustments(admin_id);
create index if not exists idx_admin_coin_adjustments_target_id
  on public.admin_coin_adjustments(target_id);
create index if not exists idx_admin_game_events_created_by
  on public.admin_game_events(created_by);
create index if not exists idx_global_announcements_created_by
  on public.global_announcements(created_by);