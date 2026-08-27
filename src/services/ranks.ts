export type TrainerRank = {
  name: string;
  division: 'V' | 'IV' | 'III' | 'II' | 'I' | null;
  symbol: string;
  displayName: string;
  minimum: number;
  nextAt: number | null;
  progress: number;
};

const TIERS = [
  { minimum: 1000, name: 'Starter Trainer', symbol: '◇' },
  { minimum: 1500, name: 'Ace Trainer', symbol: '◆' },
  { minimum: 2000, name: 'Veteran Trainer', symbol: '✦' },
  { minimum: 2500, name: 'Elite Trainer', symbol: '✧' },
  { minimum: 3000, name: 'Master Trainer', symbol: '★' },
  { minimum: 3500, name: 'Grand Trainer', symbol: '♛' },
] as const;

const DIVISIONS = ['V', 'IV', 'III', 'II', 'I'] as const;

export function getTrainerRank(value: number | null | undefined): TrainerRank {
  const rating = Math.max(0, Math.floor(Number(value ?? 0)));
  if (rating < 1000) {
    return {
      name: 'Sem Rank',
      division: null,
      symbol: '○',
      displayName: 'Sem Rank',
      minimum: 0,
      nextAt: 1000,
      progress: Math.min(100, (rating / 1000) * 100),
    };
  }

  let tierIndex = 0;
  for (let index = 0; index < TIERS.length; index += 1) {
    if (rating >= TIERS[index].minimum) tierIndex = index;
  }
  const tier = TIERS[tierIndex];
  const divisionIndex = Math.min(4, Math.floor((rating - tier.minimum) / 100));
  const division = DIVISIONS[divisionIndex];
  const nextTier = TIERS[tierIndex + 1];
  const nextAt = divisionIndex < 4 ? tier.minimum + (divisionIndex + 1) * 100 : nextTier?.minimum ?? null;
  const divisionStart = tier.minimum + divisionIndex * 100;
  const divisionEnd = nextAt ?? divisionStart + 100;

  return {
    name: tier.name,
    division,
    symbol: tier.symbol,
    displayName: `${tier.name} ${division}`,
    minimum: tier.minimum,
    nextAt,
    progress: Math.min(100, Math.max(0, ((rating - divisionStart) / Math.max(1, divisionEnd - divisionStart)) * 100)),
  };
}

export function rankLabel(value: number | null | undefined) {
  const rank = getTrainerRank(value);
  return `${rank.symbol} ${rank.displayName}`;
}
