# Trainer Collection

> **Projeto de software para feira escolar / Trabalho de Conclusão de Curso (TCC)**  
> Aplicativo social de coleção de cartas Pokémon com abertura de boosters, gerenciamento de coleção, batalhas, decks, trocas, economia virtual, guildas, ranking, missões e recursos em tempo real.

---

## 1. Visão geral do projeto

O **Trainer Collection** é um aplicativo desenvolvido para Android e Web com o objetivo de transformar a experiência de colecionar cartas em um sistema digital interativo.

O usuário cria uma conta, abre boosters, reúne cartas em sua coleção, monta decks, participa de batalhas, troca cartas com outros jogadores, entra em guildas, completa missões e acompanha sua evolução em rankings.

O projeto começou como uma ideia simples de coleção de cards e evoluiu para um sistema completo com:

- aplicativo mobile;
- versão Web;
- autenticação;
- banco de dados;
- servidor;
- recursos em tempo real;
- sistema econômico;
- sistema de batalha próprio;
- moderação;
- painel administrativo;
- atualizações OTA;
- testes automáticos e auditorias de regressão.

Atualmente, o repositório possui aproximadamente:

| Estrutura | Quantidade |
| --- | ---: |
| Telas/rotas do aplicativo | 48 |
| Edge Functions do backend | 11 |
| Migrations SQL | 179 |
| Plataformas principais | Android + Web |

---

## 2. Problema estudado

Aplicativos de coleção normalmente precisam resolver vários problemas ao mesmo tempo:

1. armazenar grandes quantidades de itens;
2. permitir busca e filtragem rápida;
3. manter dados sincronizados entre diferentes usuários;
4. impedir alterações indevidas de moedas e itens;
5. criar uma experiência interessante para o usuário;
6. manter regras de jogo consistentes;
7. funcionar tanto em celular quanto na Web;
8. permitir atualizações sem exigir uma nova instalação a cada correção.

O Trainer Collection foi desenvolvido como uma solução prática para estudar e implementar esses desafios em um único sistema.

---

## 3. Objetivo geral

Desenvolver um aplicativo completo de coleção digital de cartas com arquitetura cliente-servidor, banco de dados em nuvem, autenticação, recursos sociais, economia virtual e sistema de batalhas.

---

## 4. Objetivos específicos

- Criar uma interface responsiva para Android e Web.
- Implementar cadastro e login de usuários.
- Armazenar coleções individuais no banco de dados.
- Permitir abertura de boosters com diferentes raridades.
- Criar filtros para facilitar a busca de Pokémon.
- Permitir criação e edição de decks.
- Implementar batalhas baseadas nas características das cartas.
- Criar rankings competitivos.
- Permitir trocas seguras entre jogadores.
- Implementar guildas e guerras entre equipes.
- Criar missões, passe de batalha e recompensas.
- Implementar uma economia virtual com Coins e Diamantes.
- Criar recursos de administração e moderação.
- Utilizar atualizações OTA para corrigir e evoluir o aplicativo.
- Aplicar testes e verificações automáticas para reduzir regressões.

---

## 5. Público-alvo

O projeto foi pensado principalmente para:

- estudantes;
- fãs de jogos de coleção;
- jogadores de Pokémon;
- pessoas interessadas em card games;
- demonstrações de desenvolvimento mobile, banco de dados e sistemas em nuvem.

---

# 6. Principais funcionalidades

## 6.1 Contas e autenticação

O aplicativo possui sistema de contas com:

- cadastro por e-mail e senha;
- login;
- autenticação com Google;
- recuperação de senha;
- redefinição de senha;
- sessão persistente;
- logout;
- proteção de rotas;
- armazenamento seguro de informações de sessão.

---

## 6.2 Perfil do jogador

Cada jogador possui um perfil com informações como:

- nome de usuário;
- foto de perfil;
- nível;
- moedas;
- diamantes;
- títulos conquistados;
- posição em rankings;
- estatísticas de batalha;
- valor da coleção;
- cartas em destaque;
- vitrine pública;
- status online;
- QR Code de amizade.

Também existem temas e cosméticos para personalizar a identidade do treinador.

---

## 6.3 Bag / coleção

A **Bag** funciona como o inventário principal do jogador.

Ela permite:

- visualizar todas as cartas possuídas;
- visualizar quantidade de cópias;
- pesquisar Pokémon;
- filtrar por raridade;
- filtrar por geração;
- filtrar por coleção/set;
- filtrar por tipo de Pokémon;
- ordenar por valor;
- ordenar por maior ataque;
- ordenar por maior HP/defesa;
- ordenar por quantidade;
- localizar cartas repetidas;
- consultar valor de mercado;
- visualizar características de batalha.

### Filtro por tipo

Os filtros de tipo utilizam símbolos visuais padronizados no aplicativo, incluindo:

- Água;
- Fogo;
- Planta;
- Elétrico;
- Psíquico;
- Lutador;
- Sombrio;
- Metal;
- Incolor;
- Dragão;
- Fada.

O mesmo sistema é reutilizado em Bag, Decks, batalhas, trocas, Legado e Guerra de Guildas.

---

## 6.4 Boosters e loja de packs

O jogador pode abrir diferentes tipos de boosters.

O sistema inclui:

- boosters comprados com Coins;
- boosters comprados com Diamantes;
- diferentes coleções e gerações;
- raridades diferentes;
- probabilidades configuradas no servidor;
- sistema de pity;
- histórico de aberturas;
- animação de abertura;
- revelação individual das cartas;
- opção de revelar todas;
- resumo final do booster;
- indicação de carta nova;
- indicação de carta desejada/CHASE;
- valor de mercado;
- opção de abrir outro booster;
- atalho para a Bag.

Depois que todas as cartas são abertas, o jogador pode tocar em qualquer uma delas para visualizar a carta em tamanho maior antes de sair da tela.

---

## 6.5 Sistema de decks

O aplicativo permite criar e editar decks.

O editor possui:

- nome do deck;
- limite de cartas;
- contador em tempo real;
- valor total;
- busca;
- filtro por raridade;
- filtro por tipo;
- ordenação por ataque;
- ordenação por HP;
- ordenação por valor;
- quantidade de cópias;
- visualização detalhada da carta;
- botão de salvar fixo na tela.

A interface foi planejada para evitar que o usuário precise percorrer toda a coleção apenas para salvar alterações.

---

# 7. Sistema de batalha

Uma das partes mais complexas do projeto é o sistema de batalha.

O jogo não utiliza o preço da carta para decidir o vencedor.

As batalhas utilizam dados como:

- HP;
- ataques;
- dano;
- custo de Energia;
- fraqueza;
- resistência;
- habilidades;
- condições especiais;
- efeitos descritos nas cartas;
- restrições de ataque;
- recarga;
- descarte;
- efeitos entre turnos;
- condições de entrada de determinadas formas.

O sistema atualmente utiliza a versão interna **TCG v6** das regras implementadas no projeto.

> O sistema é continuamente auditado e testado. Ele cobre grande parte das regras necessárias para as cartas do catálogo, mas não é apresentado como uma reprodução oficial ou perfeita de todas as regras do Pokémon TCG.

---

## 7.1 Energia virtual

Para permitir batalhas sem exigir cartas de Energia no deck, foi criado um sistema de **Energia virtual**.

A Energia:

1. começa em 0;
2. aumenta ao longo dos turnos;
3. determina quando um ataque pode ser utilizado;
4. respeita o custo de Energia existente na carta.

---

## 7.2 Draft 3

O **Draft 3** é um modo no qual os jogadores:

1. escolhem cartas para o confronto;
2. veem as escolhas públicas;
3. definem qual Pokémon será utilizado em cada rodada;
4. escolhem o ataque;
5. aguardam o adversário confirmar;
6. o servidor resolve a rodada;
7. as cartas utilizadas não podem ser reutilizadas.

Durante a escolha de Pokémon existem:

- escolha entre Bag e Deck;
- filtro por tipo;
- filtro de maior ataque;
- filtro de maior HP;
- busca;
- visualização ampliada das cartas reveladas.

---

## 7.3 Escolha manual de ataques

No Draft 3, após selecionar o Pokémon, o jogador pode escolher qual ataque deseja utilizar.

A tela mostra:

- nome do ataque;
- dano;
- Energia necessária;
- descrição do efeito.

A escolha do adversário continua privada até a resolução da rodada.

---

## 7.4 Arena 2D experimental

O projeto também possui uma arena visual inspirada em RPGs de Pokémon antigos.

A arena:

- mostra os dois Pokémon;
- utiliza sprites pixelados;
- apresenta barras de HP;
- realiza animação de entrada;
- possui movimento idle;
- anima avanço de ataque;
- mostra impacto;
- mostra dano;
- permite replay da animação.

Essa arena é apenas uma representação visual.

**O resultado real continua sendo calculado pelo motor de batalha TCG v6 no servidor.**

---

## 7.5 Batalhas contra IA

Quando necessário, o sistema pode utilizar jogadores controlados por IA.

Existem diferentes níveis de bot, por exemplo:

- Novato;
- Bronze;
- Prata;
- Ouro;
- Elite;
- Mestre;
- Lenda.

Os bots são balanceados utilizando cartas reais do catálogo.

Existe também uma limitação diária de ELO para evitar farm de pontos:

| Partidas contra bot no dia | ELO aplicado |
| --- | ---: |
| 1–6 | 100% |
| 7–12 | 35% |
| 13+ | 0% |

Depois do limite, vitória e derrota ficam neutras para ELO.

---

## 7.6 Desistência

O jogador pode desistir da batalha.

Há regras diferentes dependendo do momento da desistência para evitar penalidades injustas e abuso competitivo.

---

# 8. Rankings

O aplicativo possui diferentes formas de competição.

## Ranking de batalha

Baseado no ELO do jogador.

A progressão utiliza divisões de aproximadamente 50 pontos.

## Ranking de coleção

Compara jogadores pelo valor de suas coleções.

Cartas duplicadas podem ser tratadas separadamente para evitar inflar determinadas classificações.

## Ranking semanal

Analisa a evolução do jogador durante a semana e pode distribuir recompensas para as melhores posições.

---

# 9. Economia virtual

O Trainer Collection utiliza duas moedas principais:

### Coins

Moeda de uso frequente para:

- boosters;
- mercado;
- recursos do jogo;
- alguns eventos;
- contribuições.

### Diamantes

Moeda mais rara utilizada em:

- boosters especiais;
- VIP;
- itens premium;
- recursos de maior valor.

Também existe conversão controlada entre moedas.

---

## 9.1 Venda de duplicadas

O jogador pode vender cartas repetidas.

O sistema possui:

- cálculo de valor;
- preservação de pelo menos uma cópia;
- venda unitária;
- venda em lote;
- validação no servidor;
- proteção durante eventos especiais.

---

## 9.2 Trainer Shop

A loja de cosméticos possui itens como:

- molduras;
- backgrounds;
- temas;
- estilos de carta;
- estilos de deck;
- efeitos de booster;
- títulos;
- troféus.

Os cosméticos seguem a regra:

> **Compra única. Depois de adquirido, aplicar, remover ou trocar o cosmético é gratuito.**

---

# 10. Marketplace entre jogadores

Existe um mercado interno onde jogadores podem anunciar cartas.

Funcionalidades:

- criação de anúncio;
- preço em Coins;
- exibição do valor de mercado;
- compra;
- cancelamento de anúncio;
- ofertas;
- atualização em tempo real;
- custódia segura das cartas durante o anúncio.

As operações financeiras são validadas pelo servidor.

---

# 11. Sistema de trocas

Jogadores podem trocar cartas diretamente.

O sistema possui:

- seleção de cartas;
- quantidades;
- confirmação dos participantes;
- cálculo visual do valor da oferta;
- filtros;
- busca;
- filtro por tipo;
- validação server-side;
- atualização da coleção após conclusão.

---

# 12. Amigos e recursos sociais

O aplicativo inclui:

- lista de amigos;
- solicitação de amizade;
- perfil de amigos;
- QR Code para adicionar jogador;
- status online;
- opção de ocultar presença;
- chat global;
- chat privado;
- chat de guilda;
- notificações;
- títulos exibidos junto ao nome.

---

# 13. Guildas

Os jogadores podem participar de guildas.

O sistema possui:

- líderes;
- cargos;
- convites;
- expulsão;
- missões;
- ranking;
- chat;
- identidade visual;
- pontuação coletiva.

---

## 13.1 Guerra de Guildas / Ginásios

O modo de Guerra de Guildas permite:

- defender ginásios;
- colocar Pokémon defensores;
- formar time de ataque;
- disputar territórios;
- acompanhar domínio;
- recuperar HP;
- visualizar atividade em tempo real;
- utilizar filtros de ataque, HP e tipo.

---

# 14. Missões e progressão

Existem:

- missões diárias;
- missões semanais;
- recompensas em Coins;
- recompensas em Diamantes;
- XP;
- conquistas;
- títulos;
- Battle Pass.

---

## 14.1 Battle Pass

O Passe de Batalha possui:

- níveis;
- trilha gratuita;
- trilha VIP;
- Coins;
- Diamantes;
- títulos;
- recompensas progressivas;
- missões para ganhar experiência.

---

# 15. Conquistas e títulos

O jogador pode desbloquear conquistas por:

- batalhas;
- coleção;
- progresso;
- eventos;
- atividades especiais.

Também existem títulos exclusivos que podem ser concedidos a:

- testers;
- jogadores;
- membros especiais;
- administradores.

---

# 16. Painel administrativo

O sistema possui ferramentas de administração para manutenção do projeto.

Entre elas:

- anunciar mensagens globais;
- interromper anúncios;
- ativar modo de manutenção;
- pausar atividades;
- adicionar/remover Coins;
- adicionar/remover Diamantes;
- conceder VIP;
- entregar títulos;
- banir;
- suspender;
- aplicar punições;
- consultar contas;
- visualizar histórico de ações;
- auditar gastos;
- verificar boosters abertos;
- configurar eventos;
- administrar permissões.

---

# 17. Eventos

O projeto suporta eventos temporários.

Um exemplo é o **Admin Abuse**, que pode modificar temporariamente preços e condições de boosters de acordo com regras configuradas pelo administrador.

O sistema também possui proteção para não permitir que determinadas mecânicas econômicas sejam exploradas durante eventos especiais.

---

# 18. Atualização em tempo real

O Supabase Realtime é utilizado em diferentes áreas do aplicativo, incluindo:

- chat;
- marketplace;
- guildas;
- guerras;
- batalha;
- notificações;
- atualizações de estado.

Isso reduz a necessidade de o usuário atualizar manualmente a tela.

---

# 19. Tecnologias utilizadas

## Front-end

- **React**
- **React Native**
- **TypeScript**
- **Expo**
- **Expo Router**
- **React Native Web**
- **Expo Notifications**
- **Expo Camera**
- **Expo Image Picker**
- **Expo Secure Store**

## Back-end

- **Supabase**
- **PostgreSQL**
- **Supabase Auth**
- **Supabase Realtime**
- **Edge Functions**
- **RPCs PostgreSQL**
- **Row Level Security (RLS)**

## Desenvolvimento e distribuição

- **Git**
- **GitHub**
- **GitHub Actions**
- **Expo Application Services (EAS)**
- **Expo Updates / OTA**

## Dados de cartas

O projeto utiliza dados estruturados de cartas para informações como:

- nome;
- coleção;
- raridade;
- HP;
- ataques;
- tipos;
- imagem;
- preço de mercado;
- dados necessários para batalha.

---

# 20. Arquitetura

Fluxo simplificado:

```text
┌─────────────────────────────┐
│ Android / Web               │
│ React Native + Expo         │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Serviços do aplicativo      │
│ Auth • Bag • Packs • Battle │
│ Trade • Guild • Economy     │
└──────────────┬──────────────┘
               │ HTTPS
               ▼
┌─────────────────────────────┐
│ Supabase                    │
│ Auth                        │
│ PostgreSQL                  │
│ Realtime                    │
│ Edge Functions              │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Regras server-side          │
│ Economia • Batalha • Packs  │
│ Trade • Admin • Segurança   │
└─────────────────────────────┘
```

---

# 21. Segurança

Um princípio importante do projeto é:

> **O cliente não deve poder conceder a si mesmo moedas, cartas ou resultados de batalha.**

As principais operações são verificadas no servidor.

Entre as medidas utilizadas estão:

- autenticação;
- Row Level Security;
- funções server-side;
- RPCs;
- Edge Functions;
- validação de propriedade das cartas;
- validação de saldo;
- controle de permissões;
- tabelas privadas;
- histórico de operações;
- proteção contra chamadas diretas em funções internas;
- regras anti-farm;
- validação de transações.

---

# 22. Integridade das regras de batalha

O catálogo de cartas possui mecanismos para detectar cartas novas ou alteradas que possam exigir revisão das regras.

Cartas com comportamento complexo podem ser colocadas em quarentena competitiva até serem analisadas.

Isso reduz o risco de uma carta recém-adicionada gerar resultados incorretos em partidas rankeadas.

---

# 23. Testes e qualidade

O projeto possui verificações automáticas executadas antes das publicações.

O comando principal é:

```bash
npm run verify
```

Ele executa:

1. verificação TypeScript;
2. auditoria do projeto;
3. auditoria de regressão.

Os testes de regressão verificam áreas como:

- batalha;
- timeout;
- bots;
- economia;
- cosméticos;
- Bag;
- boosters;
- decks;
- filtros;
- trocas;
- guildas;
- segurança;
- atualização OTA.

Uma alteração que falha nas verificações não é publicada automaticamente.

---

# 24. CI/CD e atualizações OTA

O projeto possui pipeline de publicação através do GitHub Actions.

Fluxo:

```text
Alteração no código
       ↓
GitHub
       ↓
Instalação das dependências
       ↓
TypeScript + auditorias
       ↓
Export da versão Web
       ↓
Deploy Web
       ↓
Publicação OTA Android
```

O **Expo Updates** permite publicar muitas correções sem gerar um novo APK.

Um APK novo é necessário principalmente quando existe alteração de código nativo ou dependência que não esteja presente na instalação atual.

---

# 25. Estrutura simplificada do repositório

```text
app/
  telas e rotas do aplicativo

src/
  components/
  services/
  theme/
  navigation/
  wallet/

supabase/
  functions/
  migrations/

scripts/
  auditorias
  testes
  ferramentas de build

assets/
  recursos visuais locais
```

---

# 26. Principais Edge Functions

O backend utiliza funções específicas para operações sensíveis:

- `admin-action`
- `battle-action`
- `booster-art`
- `chat-action`
- `deck-action`
- `market-prices`
- `open-pack`
- `player-action`
- `sync-catalog`
- `tcgplayer-price-sync`
- `trade-action`

---

# 27. Como executar localmente

## Requisitos

- Node.js
- npm
- ambiente Expo
- projeto Supabase configurado

## Instalação

```bash
npm install
```

Crie/configure o arquivo de ambiente com as credenciais necessárias do Supabase.

Depois execute:

```bash
npm run start
```

Para Web:

```bash
npm run web
```

Para Android em ambiente de desenvolvimento:

```bash
npm run android
```

---

# 28. Metodologia de desenvolvimento

O projeto foi desenvolvido de forma incremental.

O ciclo utilizado foi:

1. identificar uma necessidade;
2. desenvolver a função;
3. testar;
4. coletar feedback;
5. encontrar bugs;
6. corrigir;
7. criar proteção contra regressão;
8. publicar atualização;
9. repetir o processo.

Esse modelo permitiu que o aplicativo evoluísse de um protótipo simples para um sistema de maior complexidade.

---

# 29. Principais desafios encontrados

Durante o desenvolvimento foram enfrentados problemas reais de engenharia de software, como:

### Performance

Listas com milhares de cartas exigiram:

- paginação;
- virtualização;
- carregamento progressivo;
- redução de consultas repetidas.

### Concorrência

Compras, trocas e batalhas precisam impedir que duas operações simultâneas gerem resultados inconsistentes.

### Segurança

Operações financeiras não podem depender apenas do aplicativo instalado no celular.

### Regras de batalha

Textos de ataques variam muito entre cartas, exigindo interpretação e tratamento de exceções.

### Interface mobile

Telas com muitas cartas, filtros e estatísticas precisam continuar utilizáveis em dispositivos pequenos.

### Atualização do aplicativo

Foi necessário separar alterações compatíveis com OTA de alterações que realmente exigem um novo APK.

---

# 30. Resultados obtidos

O projeto conseguiu integrar em uma única aplicação:

- front-end mobile;
- front-end Web;
- banco de dados;
- autenticação;
- APIs;
- funções server-side;
- tempo real;
- economia;
- sistema social;
- gameplay;
- administração;
- automação de testes;
- CI/CD.

Além de funcionar como um aplicativo, o Trainer Collection se tornou uma demonstração prática de conceitos estudados em desenvolvimento de sistemas.

---

# 31. Possíveis evoluções futuras

Entre as melhorias futuras estão:

- ampliar a arena 2D;
- mapear mais formas alternativas de Pokémon nos sprites;
- adicionar novos efeitos visuais de ataques;
- continuar aumentando a cobertura das regras das cartas;
- melhorar recursos de torneios;
- ampliar ferramentas de guilda;
- melhorar análise de dados do administrador;
- expandir recursos sociais;
- continuar otimizações para grandes coleções;
- evoluir a experiência Web;
- melhorar acessibilidade.

---

# 32. Aplicação dos conhecimentos no TCC

O projeto permite demonstrar conhecimentos de diferentes áreas:

| Área | Aplicação no projeto |
| --- | --- |
| Lógica de programação | Regras, filtros, batalha e economia |
| Programação mobile | React Native e Expo |
| Desenvolvimento Web | React Native Web |
| Banco de dados | PostgreSQL |
| APIs | Comunicação cliente-servidor |
| Cloud | Supabase e Expo |
| Segurança | Auth, RLS e validação server-side |
| Engenharia de software | Arquitetura modular |
| UX/UI | Interface e fluxo mobile |
| DevOps | GitHub Actions e OTA |
| Testes | Auditorias e regressões |
| Sistemas em tempo real | Chat, mercado, guildas e batalha |

---

# 33. Sugestão de apresentação para feira

Uma demonstração curta pode seguir esta sequência:

1. apresentar o problema e o objetivo;
2. mostrar cadastro/login;
3. abrir um booster;
4. mostrar a carta obtida na Bag;
5. demonstrar filtros;
6. montar um deck;
7. iniciar uma batalha Draft 3;
8. mostrar a escolha de ataque;
9. mostrar a arena 2D;
10. mostrar marketplace/trocas;
11. mostrar guildas;
12. explicar o Supabase e a arquitetura;
13. finalizar mostrando o pipeline de testes e atualização OTA.

Isso permite apresentar tanto a parte visual quanto a parte técnica do trabalho.

---

# 34. Conclusão

O Trainer Collection demonstra como uma ideia de entretenimento pode ser utilizada para estudar e aplicar conceitos reais de desenvolvimento de sistemas.

O projeto combina interface, lógica, banco de dados, segurança, redes, APIs, tempo real, testes e distribuição de software.

Mais do que um aplicativo de cartas, ele representa um projeto integrado de engenharia de software, construído e aprimorado continuamente através de testes, análise de erros e feedback de usuários.

---

# 35. Identificação do trabalho

**Projeto:** Trainer Collection  
**Categoria:** Aplicativo mobile / sistema Web / card game digital  
**Finalidade:** Projeto educacional para feira escolar / TCC  

**Aluno:** _Guilherme Teles_  
**Turma:** _3°C_  
**Instituição:** _E.E. Amaral Wagmer_
**Ano:** 2026

---

## Aviso sobre propriedade intelectual

Este projeto possui finalidade **educacional, acadêmica e de demonstração técnica**.

Pokémon, nomes de Pokémon, Pokémon TCG, artes, marcas e demais propriedades relacionadas pertencem aos seus respectivos titulares, incluindo **The Pokémon Company, Nintendo, Game Freak e Creatures**, conforme aplicável.

O projeto não reivindica propriedade sobre essas marcas ou conteúdos e não é um produto oficial da Pokémon Company ou Nintendo.

---

## Licenciamento do código

O código deste projeto deve ser tratado de acordo com as regras definidas pelo responsável pelo repositório.

Antes de redistribuir, publicar comercialmente ou reutilizar partes do projeto, consulte o responsável e verifique também as licenças das bibliotecas e fontes de dados utilizadas.
