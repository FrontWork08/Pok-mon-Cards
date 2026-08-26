create or replace view public.set_catalog with (security_invoker = true) as
select
  c.set_id,
  max(c.set_name) as set_name,
  count(*)::integer as total_cards,
  max(p.image_url) filter (where p.image_url is not null) as representative_image
from public.cards c
left join public.packs p on p.set_id = c.set_id
group by c.set_id;
