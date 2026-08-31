// Economy 2.0 stress simulation
// Deterministic scenario model, not a prediction of individual player behavior.
// Run with: node scripts/economy-sim.mjs
//
// The model compares the audited pre-reset economy with Economy 2.0 over
// 1,000 synthetic players / 180 days. It intentionally focuses on purchasing
// power, coin supply pressure and repeatable rewards instead of card prices.

const PLAYERS = 1000;
const DAYS = 180;
const START_COINS = 100000;

function rng(seed = 0x5eed1234) {
  let x = seed >>> 0;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

const random = rng();

const profiles = [
  { name: 'casual', share: .55, activity: .38, spendShare: .38, marketShare: .03 },
  { name: 'regular', share: .35, activity: .72, spendShare: .55, marketShare: .06 },
  { name: 'hardcore', share: .10, activity: 1.00, spendShare: .66, marketShare: .10 },
];

const models = {
  legacy: {
    name: 'Pré-Economy 2.0',
    repeatableDailyMax: 60000,
    medianPack: 1000,
    packFloor: 500,
    duplicateCoinsPerPack: 165,
    marketFee: 0,
    eventLeakPerActiveDay: 900,
  },
  v2: {
    name: 'Economy 2.0',
    repeatableDailyMax: 35000,
    medianPack: 18000,
    packFloor: 5000,
    duplicateCoinsPerPack: 70,
    marketFee: .08,
    eventLeakPerActiveDay: 0,
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

function simulate(model) {
  const players = [];

  for (let i = 0; i < PLAYERS; i += 1) {
    const profile = pickProfile(i);
    let coins = START_COINS;
    let packs = 0;
    let minted = START_COINS;
    let burned = 0;

    for (let day = 0; day < DAYS; day += 1) {
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
      const packPriceNoise = .70 + random() * .75;
      const effectivePackPrice = Math.max(
        model.packFloor,
        Math.round(model.medianPack * packPriceNoise / 500) * 500,
      );
      const affordable = Math.floor(coins / effectivePackPrice);
      const wanted = Math.max(0, Math.floor(targetSpend / effectivePackPrice));
      const opened = Math.min(affordable, wanted);

      if (opened > 0) {
        const spend = opened * effectivePackPrice;
        coins -= spend;
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
        // Player-to-player transfer is supply-neutral; only the fee matters.
      }
    }

    players.push({ profile: profile.name, coins, packs, minted, burned });
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
  return {
    p50Coins: quantile(coins, .50),
    p90Coins: quantile(coins, .90),
    p99Coins: quantile(coins, .99),
    p50Packs: quantile(packs, .50),
    p90Packs: quantile(packs, .90),
    p99Packs: quantile(packs, .99),
    totalMint,
    totalBurn,
    burnToMint: totalMint ? totalBurn / totalMint : 0,
  };
}

console.log('Trainer Collection — Economy stress test');
console.log(`${PLAYERS} jogadores sintéticos • ${DAYS} dias • saldo inicial 🪙 ${fmt(START_COINS)}\n`);

for (const model of Object.values(models)) {
  const result = summarize(simulate(model));
  console.log(model.name);
  console.log(`  Pack mediano: 🪙 ${fmt(model.medianPack)}`);
  console.log(`  Máx. recorrente modelado/dia: 🪙 ${fmt(model.repeatableDailyMax)}`);
  console.log(`  Saldo p50 / p90 / p99: 🪙 ${fmt(result.p50Coins)} / ${fmt(result.p90Coins)} / ${fmt(result.p99Coins)}`);
  console.log(`  Packs p50 / p90 / p99: ${fmt(result.p50Packs)} / ${fmt(result.p90Packs)} / ${fmt(result.p99Packs)}`);
  console.log(`  Burn / mint modelado: ${(result.burnToMint * 100).toFixed(1)}%\n`);
}

console.log('Leitura: o objetivo não é zerar o saldo dos jogadores; é impedir que a');
console.log('renda recorrente compre dezenas de boosters por dia e que loops de');
console.log('boosters grátis/duplicatas criem Coins sem limite.');
