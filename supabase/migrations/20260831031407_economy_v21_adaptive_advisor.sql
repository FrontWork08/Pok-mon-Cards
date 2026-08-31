create or replace function public.server_refresh_economy_advisor(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_health jsonb;
  v_status text;
  v_ratio numeric;
  v_coins_per numeric;
begin
  if not exists(select 1 from public.admin_members where player_id=p_actor_id) then raise exception 'FORBIDDEN'; end if;

  v_health:=public.server_get_economy_health(p_actor_id);
  v_status:=coalesce(v_health->>'status','healthy');
  v_ratio:=nullif(v_health->>'burnToMintRatio','')::numeric;
  v_coins_per:=coalesce((v_health->>'coinsPerActivePlayer')::numeric,0);

  update public.economy_price_recommendations set active=false where active=true;

  if v_ratio is not null and v_ratio<0.55 then
    insert into public.economy_price_recommendations(
      health_status,burn_to_mint_ratio,recommendation_type,current_value,suggested_value,rationale
    ) values(
      v_status,v_ratio,'sink_price_multiplier',1,1.25,
      'Menos de 55% das Coins conhecidas estão saindo da economia. Aumentar preços apenas dos sinks opcionais de luxo em ~25% é preferível a taxar atividades básicas.'
    );
  elsif v_ratio is not null and v_ratio<0.75 then
    insert into public.economy_price_recommendations(
      health_status,burn_to_mint_ratio,recommendation_type,current_value,suggested_value,rationale
    ) values(
      v_status,v_ratio,'sink_price_multiplier',1,1.10,
      'A relação burn/mint está em observação. Um ajuste pequeno nos sinks opcionais pode estabilizar a circulação sem afetar iniciantes.'
    );
  elsif v_ratio is not null and v_ratio>1.25 and v_coins_per<500000 then
    insert into public.economy_price_recommendations(
      health_status,burn_to_mint_ratio,recommendation_type,current_value,suggested_value,rationale
    ) values(
      v_status,v_ratio,'sink_price_multiplier',1,0.90,
      'A economia está removendo Coins rápido demais para o saldo médio. Reduzir sinks de luxo em ~10% pode evitar escassez.'
    );
  end if;

  if v_coins_per>3000000 then
    insert into public.economy_price_recommendations(
      health_status,burn_to_mint_ratio,recommendation_type,current_value,suggested_value,rationale
    ) values(
      v_status,v_ratio,'prestige_endgame_multiplier',1,1.20,
      'O saldo médio por jogador ativo passou de 3 milhões. O Prestígio infinito é o sink mais seguro para absorver riqueza do endgame.'
    );
  end if;

  if v_coins_per>5000000 and coalesce(v_ratio,0)<0.55 then
    insert into public.economy_price_recommendations(
      health_status,burn_to_mint_ratio,recommendation_type,current_value,suggested_value,rationale
    ) values(
      v_status,v_ratio,'soft_cap_review',
      case when (select soft_cap_enabled from public.economy_policy where id=1) then 1 else 0 end,
      1,
      'Somente neste cenário extremo o sistema recomenda avaliar o soft cap. Ele continua DESATIVADO até aprovação administrativa.'
    );
  end if;

  update public.economy_alerts
  set resolved_at=now()
  where resolved_at is null and alert_key in ('burn_ratio','coin_concentration');

  if v_ratio is not null and v_ratio<0.55 then
    insert into public.economy_alerts(alert_key,severity,message,metrics)
    values(
      'burn_ratio','critical',
      'Coins estão entrando bem mais rápido do que saindo. Revise os sinks opcionais antes de aumentar recompensas.',
      jsonb_build_object('burnToMintRatio',v_ratio,'coinsPerActivePlayer',v_coins_per)
    );
  elsif v_ratio is not null and v_ratio<0.75 then
    insert into public.economy_alerts(alert_key,severity,message,metrics)
    values(
      'burn_ratio','watch',
      'A relação entre Coins criadas e removidas merece acompanhamento.',
      jsonb_build_object('burnToMintRatio',v_ratio,'coinsPerActivePlayer',v_coins_per)
    );
  end if;

  if v_coins_per>3000000 then
    insert into public.economy_alerts(alert_key,severity,message,metrics)
    values(
      'coin_concentration',
      case when v_coins_per>5000000 then 'critical' else 'watch' end,
      'O saldo médio por jogador ativo está alto para a faixa de preços atual.',
      jsonb_build_object('coinsPerActivePlayer',v_coins_per)
    );
  end if;

  return jsonb_build_object(
    'health',v_health,
    'recommendations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'generatedAt',r.generated_at,'type',r.recommendation_type,
        'currentValue',r.current_value,'suggestedValue',r.suggested_value,'rationale',r.rationale
      ) order by r.id desc)
      from public.economy_price_recommendations r where r.active=true
    ),'[]'::jsonb),
    'alerts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'severity',a.severity,'message',a.message,'metrics',a.metrics,'createdAt',a.created_at
      ) order by a.id desc)
      from public.economy_alerts a where a.resolved_at is null
    ),'[]'::jsonb)
  );
end;
$$;

grant execute on function public.server_refresh_economy_advisor(uuid) to authenticated;
