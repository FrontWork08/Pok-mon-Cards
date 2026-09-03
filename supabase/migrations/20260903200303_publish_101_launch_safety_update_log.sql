
insert into public.app_update_logs(id,version,title,summary,changes,published_at,active)
select
  coalesce((select max(id) from public.app_update_logs),0)+1,
  '1.0.1 • OTA 03/09',
  'Segurança de lançamento e experiência do treinador',
  'Pacote de preparação para o lançamento com proteção contra operações duplicadas, novos laboratórios, controles de economia, acessibilidade e ferramentas de acompanhamento.',
  array[
    'Card Passport com histórico, tags e proteção manual de cartas importantes',
    'Replay detalhado para batalhas game_v1 e Battle Lab sem ELO, prêmio ou alteração de inventário',
    'Modo Espectador opt-in com informações secretas protegidas e bloqueio em batalhas com aposta',
    'Formatos alternativos em desafios entre amigos, mantendo a ranqueada no formato Padrão',
    'Card Chase agora mostra disponibilidade no Marketplace e boosters relacionados',
    'Marketplace ganhou referência inteligente de preço sem alterar anúncios automaticamente',
    'Controle Anti-inflação com snapshots, tendências, concentração de saldo e guardrails consultivos',
    'Freeze Simulator 100% leitura para validar o reset 1.0 sem modificar contas',
    'Hall da Fama com campeões de temporadas, Copa Trainer e recordes históricos',
    'Notificações inteligentes com categorias, deduplicação e horário silencioso no fuso do aparelho',
    'Modo Performance e acessibilidade com reduzir movimento, alto contraste e texto ampliado',
    'Sons leves de batalha respeitando a preferência Sons nas batalhas',
    'Central O que mudou com controle individual de atualizações já lidas',
    'Feedback dentro do app com histórico do jogador e triagem administrativa',
    'Feature Flags com rollout gradual e liberação somente para testers quando necessário',
    'Hub Beta & Tester para acompanhar a transição 1.0 e recursos liberados',
    'Idempotência em abertura de boosters, Marketplace e venda de repetidas para evitar cobrança ou entrega duplicada em retries',
    'Resumo Semanal dos últimos 7 dias, com entrega automática às segundas no horário local',
    'Permissões de formatos de batalha e RPCs sensíveis reforçadas após auditoria de segurança'
  ]::text[],
  now(),
  true
where not exists(
  select 1 from public.app_update_logs where version='1.0.1 • OTA 03/09'
);
