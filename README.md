# Pokémon Cards

Jogo social de coleção de cards Pokémon com abertura de boosters, Bag, pesquisa, filtros e trocas entre jogadores.

## Stack inicial

- Expo + React Native + TypeScript
- Expo Router
- Supabase (Auth, PostgreSQL, Realtime e funções server-side)
- Catálogo de cartas preparado para integração com Pokémon TCG API

## Princípios da arquitetura

- O cliente nunca concede moedas, boosters ou cards diretamente.
- Abertura de pacotes e trocas devem ser validadas no servidor.
- A Bag do jogador é persistida no backend.
- Cards de Energy e Trainer serão excluídos do catálogo jogável.
- Duplicatas permanecem na coleção para serem usadas em trocas.

## Módulos da primeira versão

1. Home
2. Packs / Loja
3. Bag
4. Trade
5. Profile

## Executar o app

```bash
npm install
cp .env.example .env
npm run start
```

Preencha as variáveis do Supabase no `.env`.

## Backend

O schema inicial está em `supabase/schema.sql`.

> Projeto privado/pessoal. Pokémon e Pokémon TCG são propriedades de seus respectivos titulares.
