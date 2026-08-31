// Economy 2.1 stress simulation
// Deterministic scenario model, not a prediction of individual player behavior.
// Run with: node scripts/economy-sim.mjs
//
// Compares the audited Beta economy, Economy 2.0 core balance, and Economy 2.1
// with optional permanent sinks over 30/90/180/365 days and 1,000 players.

const PLAYERS = 1000;
const HORIZONS = [30, 90, 180, 365];
const START_COINS = 100000;

function rng(seed = 0x5eed1234) {
  let x = seed >>> 0;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

const profiles = [
  { name: 'casual', share: .55, activity: .38, spendShare: .38, marketShare: .03, sinkShare: .06 },
  { name: 'regular', share: .35, activity: .72, spendShare: .55, marketShare: .06, sinkShare: .13 },
  { name: 'hardcore', share: .10, activity: 1.00, spendShare: .66, marketShare: .10, sinkShare: .24 },
];

const models = {
  legacy: {
    name: 'Beta / pré-Economy 2.0',
    repeatableDailyMax: 60000,
    medianPack: 1000,
    packFloor: 500,
    duplicateCoinsPerPack: 165,
    marketFee: 0,
    eventLeakPerActiveDay: 900,
    permanentSinks: false,
  },
  v2: {
    name: 'Economy 2.0',
    repeatableDailyMax: 35000,
    medianPack: 18000,
    packFloor: 5000,
    duplicateCoinsPerPack: 70,
    marketFee: .08,
    eventLeakPerActiveDay: 0,
    permanentSinks: false,
  },
  v21: {
    name: 'Economy 2.1 + sinks permanentes',
    repeatableDailyMax: 35000,
    medianPack: 18000,
    packFloor: 5000,
    duplicateCoinsPerPack: 70,
    marketFee: .08,
    eventLeakPerActiveDay: 0,
    permanentSinks: true,
  },
};

function pickProfile(index) {
  const r = (index + .5) / PLAYERS;
  let acc = 0;
  for (const profile of profiles) {
    acc += profile.share;
    if (r <= acc) return profile;
  }
  return profiles[profiles.length - 1];
}

function simulate(model, days, seed) {
  const random = rng(seed);
  const players = [];

  for (let i = 0; i < PLAYERS; i += 1) {
    const profile = pickProfile(i);
    let coins = START_COINS;
    let packs = 0;
    let minted = START_COINS;
    let burned = 0;
    let permanentBurned = 0;
    let packBudget = 0;

    for (let day = 0; day < days; day += 1) {
      const active = random() < Math.min(1, profile.activity + .12);
      if (!active) continue;

      const consistency = .82 + random() * .36;
      const dailyMint = Math.round(model.repeatableDailyMax * profile.activity * consistency);
      coins += dailyMint;
      minted += dailyMint;

      const eventLeak = Math.round(model.eventLeakPerActiveDay * profile.activity);
      coins += eventLeak;
      minted += eventLeak;

      const targetSpend = Math.floor(dailyMint * profile.spendShare);
      packBudget += targetSpend;
      const packPriceNoise = .70 + random() * .75;
      const effectivePackPrice = Math.max(
        model.packFloor,
        Math.round(model.medianPack * packPriceNoise / 500) * 500,
      );
      const affordable = Math.floor(coins / effectivePackPrice);
      const wanted = Math.max(0, Math.floor(packBudget / effectivePackPrice));
      const opened = Math.min(affordable, wanted);

      if (opened > 0) {
        const spend = opened * effectivePackPrice;
        coins -= spend;
        packBudget = Math.max(0, packBudget - spend);
        burned += spend;
        packs += opened;

        const duplicateMint = Math.round(opened * model.duplicateCoinsPerPack * (.75 + random() * .5));
        coins += duplicateMint;
        minted += duplicateMint;
      }

      if (random() < profile.marketShare) {
        const grossTrade = Math.round((6000 + random() * 44000) / 100) * 100;
        const fee = Math.ceil(grossTrade * model.marketFee);
        burned += fee;
      }

      if (model.permanentSinks && day % 7 === 6) {
        // Optional cosmetics/projects: players keep a healthy reserve and only
        // spend a fraction of their weekly income on non-power progression.
        const reserve = Math.max(START_COINS, model.medianPack * 4);
        const weeklySinkBudget = Math.round(model.repeatableDailyMax * 7 * profile.activity * profile.sinkShare);
        const luxuryNoise = .65 + random() * .70;
        const permanentSpend = Math.max(
          0,
          Math.min(
            coins - reserve,
            Math.round(weeklySinkBudget * luxuryNoise / 1000) * 1000,
          ),
        );
        if (permanentSpend > 0) {
          coins -= permanentSpend;
          burned += permanentSpend;
          permanentBurned += permanentSpend;
        }
      }

      if (
        model.permanentSinks
        && profile.name === 'hardcore'
        && day > 0
        && day % 30 === 0
        && coins > 1000000
      ) {
        // Endgame prestige/auction behavior for wealthy players.
        const prestigeSpend = Math.min(coins - 500000, 250000 + Math.floor(day / 90) * 250000);
        if (prestigeSpend > 0) {
          coins -= prestigeSpend;
          burned += prestigeSpend;
          permanentBurned += prestigeSpend;
        }
      }
    }

    players.push({ profile: profile.name, coins, packs, minted, burned, permanentBurned });
  }

  return players;
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

function fmt(value) {
  return Math.round(value).toLocaleString('pt-BR');
}

function summarize(rows) {
  const coins = rows.map((r) => r.coins);
  const packs = rows.map((r) => r.packs);
  const totalMint = rows.reduce((sum, r) => sum + r.minted, 0);
  const totalBurn = rows.reduce((sum, r) => sum + r.burned, 0);
  const permanentBurn = rows.reduce((sum, r) => sum + r.permanentBurned, 0);
  return {
    p50Coins: quantile(coins, .50),
    p90Coins: quantile(coins, .90),
    p99Coins: quantile(coins, .99),
    p50Packs: quantile(packs, .50),
    p90Packs: quantile(packs, .90),
    p99Packs: quantile(packs, .99),
    totalMint,
    totalBurn,
    permanentBurn,
    burnToMint: totalMint ? totalBurn / totalMint : 0,
  };
}

console.log('Trainer Collection — Economy 2.1 stress test');
console.log(`${PLAYERS} jogadores sintéticos • saldo inicial 🪙 ${fmt(START_COINS)}`);
console.log('Sinks permanentes são opcionais no modelo e nunca concedem poder de batalha.\n');

for (const days of HORIZONS) {
  console.log(`=== ${days} DIAS ===`);
  let modelIndex = 0;
  for (const model of Object.values(models)) {
    // Equal deterministic seed per model/horizon makes model comparisons use
    // the same activity/noise stream as closely as possible.
    const result = summarize(simulate(model, days, 0x5eed1234 + days * 101 + modelIndex * 0));
    console.log(model.name);
    console.log(`  Saldo p50 / p90 / p99: 🪙 ${fmt(result.p50Coins)} / ${fmt(result.p90Coins)} / ${fmt(result.p99Coins)}`);
    console.log(`  Packs p50 / p90 / p99: ${fmt(result.p50Packs)} / ${fmt(result.p90Packs)} / ${fmt(result.p99Packs)}`);
    console.log(`  Burn / mint: ${(result.burnToMint * 100).toFixed(1)}%${model.permanentSinks ? ` • sinks permanentes 🪙 ${fmt(result.permanentBurn)}` : ''}`);
    modelIndex += 1;
  }
  console.log('');
}

console.log('Critérios de leitura:');
console.log('  • p50 não deve ficar sem capacidade de abrir boosters.');
console.log('  • p90/p99 podem acumular, mas precisam ter sinks desejáveis para o endgame.');
console.log('  • soft cap não faz parte do cenário-base; ele continua desativado.');
console.log('  • mercado transfere Coins entre jogadores; apenas a taxa entra como burn.');
