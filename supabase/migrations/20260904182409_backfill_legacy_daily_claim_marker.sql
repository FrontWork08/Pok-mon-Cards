update public.players p
set last_daily_claim_at = greatest(
  coalesce(p.last_daily_claim_at,'-infinity'::timestamptz),
  (ls.last_claim_date::timestamp at time zone 'UTC')
)
from public.player_login_streaks ls
where ls.player_id=p.id
  and ls.last_claim_date is not null
  and (p.last_daily_claim_at is null or p.last_daily_claim_at::date < ls.last_claim_date);
