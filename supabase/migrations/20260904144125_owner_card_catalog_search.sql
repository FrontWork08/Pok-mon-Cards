-- Owner-only full card catalog search used by the Admin card grant screen.

create or replace function public.server_owner_search_cards(
  p_actor_id uuid,
  p_search text default null,
  p_offset integer default 0,
  p_limit integer default 80
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_q text:=nullif(btrim(coalesce(p_search,'')),'');
  v_offset integer:=greatest(0,coalesce(p_offset,0));
  v_limit integer:=greatest(1,least(coalesce(p_limit,80),120));
begin
  if not exists(select 1 from public.admin_members where player_id=p_actor_id and role='owner') then
    raise exception 'OWNER_ONLY';
  end if;

  return jsonb_build_object(
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'name',c.pokemon_name,'setId',c.set_id,'setName',c.set_name,'number',c.card_number,
        'rarity',c.rarity,'image',coalesce(c.image_large,c.image_small),'imageSmall',c.image_small,
        'marketPriceUsd',c.market_price_usd
      ) order by c.pokemon_name,c.set_name,c.card_number,c.id)
      from (
        select * from public.cards
        where v_q is null
          or pokemon_name ilike '%'||v_q||'%'
          or id ilike '%'||v_q||'%'
          or set_id ilike '%'||v_q||'%'
          or set_name ilike '%'||v_q||'%'
          or coalesce(card_number,'') ilike '%'||v_q||'%'
        order by pokemon_name,set_name,card_number,id
        offset v_offset limit v_limit
      ) c
    ),'[]'::jsonb),
    'total',(select count(*) from public.cards c where v_q is null or c.pokemon_name ilike '%'||v_q||'%' or c.id ilike '%'||v_q||'%' or c.set_id ilike '%'||v_q||'%' or c.set_name ilike '%'||v_q||'%' or coalesce(c.card_number,'') ilike '%'||v_q||'%'),
    'offset',v_offset,
    'limit',v_limit
  );
end;
$$;

revoke all on function public.server_owner_search_cards(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.server_owner_search_cards(uuid,text,integer,integer) to service_role;
