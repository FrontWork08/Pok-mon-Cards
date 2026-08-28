-- Public update log for the combined social/battle/deck/rank/price release.
update public.app_update_logs
set changes = (
  select array_agg(distinct item order by item)
  from unnest(changes || array[
    'Preços agora tentam TCGplayer market, mid/low reais e uma segunda fonte TCGplayer antes de mostrar indisponível',
    'Deck Builder ganhou filtros por tipo, raridade, dano, HP, valor e quantidade, com estatísticas ao tocar na carta',
    'Batalhas agora permitem desistir; antes da primeira escolha a vitória vai ao rival sem alteração de ELO',
    'Guildas ganharam chat privado em tempo real para membros, com títulos e perfis',
    'Divisões de ELO agora avançam a cada 50 pontos'
  ]::text[]) item
)
where version='0.1.1 • OTA 28/08';
