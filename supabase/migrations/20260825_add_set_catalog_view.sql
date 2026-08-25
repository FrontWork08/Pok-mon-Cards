create or replace view public.set_catalog with (security_invoker = true) as
select
  c.set_id,
  max(c.set_name) as set_name,
  count(*)::integer as total_cards,
  min(c.image_small) filter (where c.image_small is not null) as representative_image
from public.cards c
group by c.set_id;

grant select on public.set_catalog to authenticated;
