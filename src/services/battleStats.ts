import type { OwnedCardEntry } from '@/services/player';

export type BattleCardProfile = {
  hp: number;
  maxDamage: number;
  minEnergy: number;
  bestEnergy: number;
  retreatCost: number;
  attackCount: number;
  abilityCount: number;
  effectAttackCount: number;
  damagePerEnergy: number;
  efficiencyScore: number;
  speedScore: number;
  techniqueScore: number;
  battleRating: number;
  score: number;
};

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

function numberFrom(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedServerProfile(value: any): BattleCardProfile | null {
  if (!value || typeof value !== 'object') return null;
  const hp=numberFrom(value.hp,50);
  const maxDamage=numberFrom(value.maxDamage,10);
  const minEnergy=numberFrom(value.minEnergy,1);
  const bestEnergy=numberFrom(value.bestEnergy,1);
  const retreatCost=numberFrom(value.retreatCost,0);
  const attackCount=numberFrom(value.attackCount,0);
  const abilityCount=numberFrom(value.abilityCount,0);
  const effectAttackCount=numberFrom(value.effectAttackCount,0);
  const damagePerEnergy=numberFrom(value.damagePerEnergy,10);
  const efficiencyScore=numberFrom(value.efficiencyScore,0);
  const speedScore=numberFrom(value.speedScore,20);
  const techniqueScore=numberFrom(value.techniqueScore,0);
  const battleRating=numberFrom(value.battleRating,1);
  return {
    hp,maxDamage,minEnergy,bestEnergy,retreatCost,attackCount,abilityCount,effectAttackCount,
    damagePerEnergy,efficiencyScore,speedScore,techniqueScore,battleRating,score:battleRating,
  };
}

export function getBattleCardPreview(card: OwnedCardEntry['cards']): BattleCardProfile {
  const serverProfile=normalizedServerProfile((card as any)?.battle_profile);
  if(serverProfile)return serverProfile;

  const data=card?.tcg_data as any;
  const parsedHp=Number(String(data?.hp??'').replace(/[^0-9]/g,''));
  const hp=Number.isFinite(parsedHp)&&parsedHp>0?clamp(parsedHp,10,1000):50;
  const attacks=Array.isArray(data?.attacks)?data.attacks:[];
  let maxDamage=0;
  let minEnergy=10;
  let bestEnergy=1;
  let bestDpe=0;
  let effectAttackCount=0;

  for(const attack of attacks){
    const match=String(attack?.damage??'').match(/[0-9]+/);
    const damage=match?Number(match[0]):0;
    const explicitEnergy=Number(String(attack?.convertedEnergyCost??'').replace(/[^0-9]/g,''));
    const energy=clamp(
      Number.isFinite(explicitEnergy)&&explicitEnergy>0
        ? explicitEnergy
        : Array.isArray(attack?.cost)
          ? Math.max(1,attack.cost.length)
          : 1,
      1,
      10,
    );
    minEnergy=Math.min(minEnergy,energy);
    if(String(attack?.text??'').trim())effectAttackCount+=1;
    if(damage>maxDamage||(damage===maxDamage&&damage>0&&energy<bestEnergy)){
      maxDamage=damage;
      bestEnergy=energy;
    }
    if(damage>0)bestDpe=Math.max(bestDpe,damage/energy);
  }

  if(maxDamage<=0){
    maxDamage=10;
    bestEnergy=1;
    bestDpe=10;
  }
  if(minEnergy===10)minEnergy=1;

  const abilities=Array.isArray(data?.abilities)?data.abilities:[];
  const retreatText=String(data?.convertedRetreatCost??'').replace(/[^0-9]/g,'');
  const retreatRaw=retreatText ? Number(retreatText) : Number.NaN;
  const retreatCost=clamp(
    Number.isFinite(retreatRaw)
      ? retreatRaw
      : Array.isArray(data?.retreatCost)
        ? data.retreatCost.length
        : 0,
    0,
    10,
  );
  const resistanceCount=Array.isArray(data?.resistances)?data.resistances.length:0;

  const efficiencyScore=Math.round(clamp((bestDpe/120)*100,0,100));
  const speedScore=Math.round(clamp(100-(minEnergy-1)*14-retreatCost*7,20,100));
  const techniqueScore=Math.round(clamp(
    attacks.length*4+effectAttackCount*10+abilities.length*18+resistanceCount*8,
    0,
    100,
  ));
  const hpScore=clamp((hp/400)*100,0,100);
  const attackScore=clamp((maxDamage/300)*100,0,100);
  const battleRating=Math.round(clamp(
    (hpScore*.28+attackScore*.30+efficiencyScore*.22+speedScore*.12+techniqueScore*.08)*10,
    1,
    1000,
  ));

  return {
    hp,
    maxDamage,
    minEnergy,
    bestEnergy,
    retreatCost,
    attackCount:attacks.length,
    abilityCount:abilities.length,
    effectAttackCount,
    damagePerEnergy:Math.round(bestDpe*100)/100,
    efficiencyScore,
    speedScore,
    techniqueScore,
    battleRating,
    score:battleRating,
  };
}
