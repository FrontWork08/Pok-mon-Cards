
drop policy if exists ranked_bot_card_pool_no_direct_access on private.ranked_bot_card_pool;
create policy ranked_bot_card_pool_no_direct_access
on private.ranked_bot_card_pool
for all
to public
using (false)
with check (false);
