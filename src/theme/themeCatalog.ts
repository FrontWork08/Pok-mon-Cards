export const THEME_CATALOG = {
  trainer: { name:'Trainer Gold', icon:'shield', accent:'#D9B24C', secondary:'#6D82FF', soft:'#2A2417', bg:'#070A12', surface:'#0D1320', surfaceAlt:'#151D2B', lightBg:'#FFF8E8', mascot:'Rayquaza', image:'https://images.pokemontcg.io/col1/SL10.png' },
  midnight: { name:'Midnight', icon:'moon', accent:'#9B7BFF', secondary:'#5EDCFF', soft:'#2D2358', bg:'#100D24', surface:'#1B1635', surfaceAlt:'#282047', lightBg:'#F1EEFF', mascot:'Umbreon', image:'https://images.pokemontcg.io/ecard2/H29.png' },
  poke_red: { name:'Poké Red', icon:'radio-button-on', accent:'#FF5264', secondary:'#FFD54A', soft:'#4A2029', bg:'#1F0C12', surface:'#30131B', surfaceAlt:'#45202A', lightBg:'#FFF0F2', mascot:'Charizard', image:'https://images.pokemontcg.io/bw8/136.png' },
  electric: { name:'Elétrico', icon:'flash', accent:'#FFD83D', secondary:'#4F9BFF', soft:'#4A4019', bg:'#191707', surface:'#29250B', surfaceAlt:'#3B3512', lightBg:'#FFFBE5', mascot:'Pikachu', image:'https://images.pokemontcg.io/ru1/7.png' },
  ghost: { name:'Fantasma', icon:'skull', accent:'#A970FF', secondary:'#E778D2', soft:'#352050', bg:'#160D22', surface:'#251438', surfaceAlt:'#35204B', lightBg:'#F7EEFF', mascot:'Gengar', image:'https://images.pokemontcg.io/ecard1/13.png' },
  fire: { name:'Fogo', icon:'flame', accent:'#FF7A3D', secondary:'#FFD04A', soft:'#512513', bg:'#210D07', surface:'#33150C', surfaceAlt:'#492114', lightBg:'#FFF2E9', mascot:'Charizard', image:'https://images.pokemontcg.io/bw8/136.png' },
  water: { name:'Água', icon:'water', accent:'#42B9FF', secondary:'#5EE4D2', soft:'#153E58', bg:'#061A29', surface:'#0D2A3D', surfaceAlt:'#143B52', lightBg:'#EAF8FF', mascot:'Blastoise', image:'https://images.pokemontcg.io/bw8/137.png' },
  grass: { name:'Planta', icon:'leaf', accent:'#64D56B', secondary:'#D8E64E', soft:'#173D20', bg:'#081A0C', surface:'#102B16', surfaceAlt:'#183C20', lightBg:'#EFFBEF', mascot:'Venusaur', image:'https://images.pokemontcg.io/ru1/1.png' },
  psychic: { name:'Psíquico', icon:'eye', accent:'#E76BB5', secondary:'#9B7BFF', soft:'#4B1F3B', bg:'#1C0B18', surface:'#2D1428', surfaceAlt:'#43203B', lightBg:'#FFF0FA', mascot:'Mewtwo', image:'https://images.pokemontcg.io/ru1/9.png' },
  dragon: { name:'Dragão', icon:'sparkles', accent:'#7C8CFF', secondary:'#F2A34B', soft:'#2A315C', bg:'#0E1228', surface:'#171D3B', surfaceAlt:'#242B4F', lightBg:'#F0F2FF', mascot:'Rayquaza', image:'https://images.pokemontcg.io/col1/SL10.png' },
  fighting: { name:'Lutador', icon:'barbell', accent:'#D9825B', secondary:'#FFD36A', soft:'#4A2B1F', bg:'#1D0F0A', surface:'#2E1911', surfaceAlt:'#43261A', lightBg:'#FFF4EC', mascot:'Machamp', image:'https://images.pokemontcg.io/ecard3/H15.png' },
  steel: { name:'Metal', icon:'hardware-chip', accent:'#AABAC9', secondary:'#6BD0E8', soft:'#2B3540', bg:'#11171D', surface:'#1A232C', surfaceAlt:'#283440', lightBg:'#F1F5F7', mascot:'Metagross', image:'https://images.pokemontcg.io/bwp/BW75.png' },
  fairy: { name:'Fada', icon:'heart', accent:'#FF92CF', secondary:'#FFD1EA', soft:'#50243D', bg:'#1F0E18', surface:'#321828', surfaceAlt:'#48243A', lightBg:'#FFF1FA', mascot:'Sylveon', image:'https://images.pokemontcg.io/xyp/XY04.png' },
  darkness: { name:'Noturno', icon:'moon', accent:'#8E7B9E', secondary:'#D1A7FF', soft:'#2E2636', bg:'#0F0B13', surface:'#1C1622', surfaceAlt:'#2A2232', lightBg:'#F6F0FA', mascot:'Tyranitar', image:'https://images.pokemontcg.io/neo2/12.png' },
  kanto: { name:'Kanto Selvagem', icon:'paw', accent:'#F0525F', secondary:'#F5D34B', soft:'#44242A', bg:'#171116', surface:'#27191D', surfaceAlt:'#382428', lightBg:'#FFF1F0', mascot:'Pikachu', image:'https://images.pokemontcg.io/ru1/7.png' },
  johto: { name:'Johto Dourada', icon:'leaf', accent:'#D4A62A', secondary:'#67C18A', soft:'#3E351D', bg:'#15160D', surface:'#252518', surfaceAlt:'#383621', lightBg:'#FFF9E7', mascot:'Umbreon', image:'https://images.pokemontcg.io/ecard2/H29.png' },
  hoenn: { name:'Hoenn Oceânica', icon:'water', accent:'#38A7D8', secondary:'#EF6A56', soft:'#173E51', bg:'#071924', surface:'#0F2936', surfaceAlt:'#163D4C', lightBg:'#EAF8FA', mascot:'Rayquaza', image:'https://images.pokemontcg.io/col1/SL10.png' },
  sinnoh: { name:'Sinnoh Cósmica', icon:'sparkles', accent:'#8C87E8', secondary:'#9EDDEA', soft:'#302E55', bg:'#111326', surface:'#1C2038', surfaceAlt:'#292E4B', lightBg:'#F1F3FF', mascot:'Lucario', image:'https://images.pokemontcg.io/bwp/BW85.png' },
} as const;

export type ThemeCatalogName = keyof typeof THEME_CATALOG;
export function getThemeVisual(theme: string) {
  return THEME_CATALOG[theme as ThemeCatalogName] ?? THEME_CATALOG.trainer;
}
