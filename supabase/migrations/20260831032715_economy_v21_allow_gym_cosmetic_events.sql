alter table public.guild_war_gym_events
  drop constraint if exists guild_war_gym_events_event_type_check;
alter table public.guild_war_gym_events
  add constraint guild_war_gym_events_event_type_check
  check (event_type in ('defender_set','heal','attack','capture','cosmetic'));
