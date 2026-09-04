import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const app = fs.readFileSync('app/team-battle/[id].tsx', 'utf8');
const helperSource = fs.readFileSync('src/battles/teamSelection.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260904233403_team3_forfeit_respects_team_selection.sql', 'utf8');

const required = [
  "getMyDecks",
  "deckPickerOpen",
  "selectedDeckId",
  "typeFilter",
  "sortMode",
  "data={cardsLoading ? [] : visibleCards}",
  "FILTRAR POR TIPO",
  "ORDENAR",
  "Escolher deck",
  "forfeitOpen",
  "doForfeit",
  "Antes de confirmar a equipe, a desistência encerra a partida sem alterar o ELO.",
];
const missing = required.filter((value) => !app.includes(value));
if (app.includes('Alert.alert')) missing.push('Team 3x3 must use in-game confirmation instead of Alert.alert');
const surrenderCount = (app.match(/Desistir da batalha/g) ?? []).length;
if (surrenderCount < 2) missing.push('Surrender control must exist during setup and live battle');
if (!migration.includes('private.battle_team_members')) missing.push('Team selection must affect forfeit neutrality');
if (missing.length) {
  console.error('❌ Team 3x3 required-controls audit failed:', missing);
  process.exit(1);
}

const output = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
const context = { module, exports: module.exports, console, Set, Number, String, Array, Object, Math };
vm.runInNewContext(output, context, { filename: 'teamSelection.js' });
const { filterAndSortTeamCards, getDeckCardIds, getAvailableTeamTypes } = module.exports;

const cards = [
  { cardId: 'a', name: 'Alpha', setName: 'One', types: ['fire'], hp: 80, attack: 70, defense: 60, speed: 90, gameValue: 100 },
  { cardId: 'b', name: 'Beta', setName: 'Two', types: ['water'], hp: 120, attack: 40, defense: 100, speed: 30, gameValue: 300 },
  { cardId: 'c', name: 'Gamma', setName: 'Three', types: ['fire', 'flying'], hp: 100, attack: 110, defense: 50, speed: 80, gameValue: 200 },
];
const deckIds = getDeckCardIds({ deck_cards: [{ card_id: 'a' }, { card_id: 'c' }] });
const ids = (rows) => rows.map((row) => row.cardId).join(',');
if (ids(filterAndSortTeamCards(cards, { deckCardIds: deckIds, sortMode: 'attack' })) !== 'c,a') throw new Error('deck + attack sort regression');
if (ids(filterAndSortTeamCards(cards, { typeFilter: 'water' })) !== 'b') throw new Error('type filter regression');
if (ids(filterAndSortTeamCards(cards, { search: 'three' })) !== 'c') throw new Error('search regression');
if (ids(filterAndSortTeamCards(cards, { sortMode: 'hp' })) !== 'b,c,a') throw new Error('HP sort regression');
if (ids(filterAndSortTeamCards(cards, { sortMode: 'speed' })) !== 'a,c,b') throw new Error('speed sort regression');
const types = getAvailableTeamTypes(cards).join(',');
if (types !== 'fire,flying,water') throw new Error(`type catalog regression: ${types}`);
console.log('✅ Team 3x3 controls: deck, filters, sorting and surrender invariants verified.');
