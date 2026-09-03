import { supabase } from '@/lib/supabase';

export type JourneyPhase = 'inicio'|'medio'|'longo';

export type TrainerJourneyStep = {
  id:string;
  title:string;
  description:string;
  route:string;
  phase:JourneyPhase;
  sort:number;
  progress:number;
  target:number;
  completed:boolean;
  claimed:boolean;
  rewardCoins:number;
  rewardDiamonds:number;
};

export type TrainerRegionProgress = {
  generation:number;
  name:string;
  owned:number;
  target:number;
  completed:boolean;
  rewardClaimed:boolean;
};

export type TrainerSeasonHistory = {
  id:string;
  name:string;
  themeColor:string;
  startsAt:string;
  endsAt:string;
  points:number;
  wins:number;
  losses:number;
  matches:number;
  bestStreak:number;
  rank:number;
  rewardClaimed:boolean;
};

export type TrainerCareer = {
  player:{
    id:string;
    username:string;
    level:number;
    xp:number;
    createdAt:string;
    accountAgeDays:number;
    battleRating:number;
    battleWins:number;
    battleLosses:number;
    bestBattleStreak:number;
    title:{id:string;title:string;icon:string}|null;
  };
  collection:{
    uniqueCards:number;
    totalCopies:number;
    valueUsd:number;
    species:number;
    completedSets:number;
  };
  social:{
    friends:number;
    completedTrades:number;
    guild:{id:string;name:string;color:string;role:string;level:number;xp:number}|null;
  };
  achievements:{unlocked:number;total:number};
  signatureCard:{
    id:string;
    name:string;
    setName:string;
    rarity:string|null;
    imageSmall:string|null;
    imageLarge:string|null;
    marketPriceUsd:number|null;
    gameTypes:string[];
  }|null;
  journey:TrainerJourneyStep[];
  regions:TrainerRegionProgress[];
  seasonHistory:TrainerSeasonHistory[];
  careerScore:number;
};

export type TrainerJourneySummary = {
  total:number;
  completed:number;
  claimed:number;
  claimable:number;
  currentStep:TrainerJourneyStep|null;
  allClaimed:boolean;
};

function normalizeCareer(raw:any):TrainerCareer{
  return {
    player:{
      id:String(raw?.player?.id??''),
      username:String(raw?.player?.username??'Treinador'),
      level:Number(raw?.player?.level??1),
      xp:Number(raw?.player?.xp??0),
      createdAt:String(raw?.player?.createdAt??''),
      accountAgeDays:Number(raw?.player?.accountAgeDays??0),
      battleRating:Number(raw?.player?.battleRating??1000),
      battleWins:Number(raw?.player?.battleWins??0),
      battleLosses:Number(raw?.player?.battleLosses??0),
      bestBattleStreak:Number(raw?.player?.bestBattleStreak??0),
      title:raw?.player?.title??null,
    },
    collection:{
      uniqueCards:Number(raw?.collection?.uniqueCards??0),
      totalCopies:Number(raw?.collection?.totalCopies??0),
      valueUsd:Number(raw?.collection?.valueUsd??0),
      species:Number(raw?.collection?.species??0),
      completedSets:Number(raw?.collection?.completedSets??0),
    },
    social:{
      friends:Number(raw?.social?.friends??0),
      completedTrades:Number(raw?.social?.completedTrades??0),
      guild:raw?.social?.guild?{
        ...raw.social.guild,
        level:Number(raw.social.guild.level??1),
        xp:Number(raw.social.guild.xp??0),
      }:null,
    },
    achievements:{
      unlocked:Number(raw?.achievements?.unlocked??0),
      total:Number(raw?.achievements?.total??0),
    },
    signatureCard:raw?.signatureCard?{
      ...raw.signatureCard,
      marketPriceUsd:raw.signatureCard.marketPriceUsd==null?null:Number(raw.signatureCard.marketPriceUsd),
      gameTypes:Array.isArray(raw.signatureCard.gameTypes)?raw.signatureCard.gameTypes.map(String):[],
    }:null,
    journey:Array.isArray(raw?.journey)?raw.journey.map((step:any)=>({
      id:String(step.id),
      title:String(step.title),
      description:String(step.description),
      route:String(step.route),
      phase:step.phase as JourneyPhase,
      sort:Number(step.sort??0),
      progress:Number(step.progress??0),
      target:Number(step.target??1),
      completed:Boolean(step.completed),
      claimed:Boolean(step.claimed),
      rewardCoins:Number(step.rewardCoins??0),
      rewardDiamonds:Number(step.rewardDiamonds??0),
    })):[],
    regions:Array.isArray(raw?.regions)?raw.regions.map((region:any)=>({
      generation:Number(region.generation??0),
      name:String(region.name??'Região'),
      owned:Number(region.owned??0),
      target:Number(region.target??0),
      completed:Boolean(region.completed),
      rewardClaimed:Boolean(region.rewardClaimed),
    })):[],
    seasonHistory:Array.isArray(raw?.seasonHistory)?raw.seasonHistory.map((season:any)=>({
      id:String(season.id),
      name:String(season.name),
      themeColor:String(season.themeColor??'#FFD447'),
      startsAt:String(season.startsAt??''),
      endsAt:String(season.endsAt??''),
      points:Number(season.points??0),
      wins:Number(season.wins??0),
      losses:Number(season.losses??0),
      matches:Number(season.matches??0),
      bestStreak:Number(season.bestStreak??0),
      rank:Number(season.rank??0),
      rewardClaimed:Boolean(season.rewardClaimed),
    })):[],
    careerScore:Number(raw?.careerScore??0),
  };
}

export async function getTrainerCareer():Promise<TrainerCareer>{
  const {data,error}=await supabase.rpc('get_trainer_career');
  if(error)throw error;
  return normalizeCareer(data??{});
}

export async function getTrainerJourneySummary():Promise<TrainerJourneySummary>{
  const {data,error}=await supabase.rpc('get_trainer_journey_summary');
  if(error)throw error;
  return {
    total:Number(data?.total??0),
    completed:Number(data?.completed??0),
    claimed:Number(data?.claimed??0),
    claimable:Number(data?.claimable??0),
    currentStep:data?.currentStep?{
      ...data.currentStep,
      sort:Number(data.currentStep.sort??0),
      progress:Number(data.currentStep.progress??0),
      target:Number(data.currentStep.target??1),
      completed:Boolean(data.currentStep.completed),
      claimed:false,
      rewardCoins:Number(data.currentStep.rewardCoins??0),
      rewardDiamonds:Number(data.currentStep.rewardDiamonds??0),
    }:null,
    allClaimed:Boolean(data?.allClaimed),
  };
}

export async function claimTrainerJourneyStep(stepId:string){
  const {data,error}=await supabase.rpc('claim_trainer_journey_step',{p_step:stepId});
  if(error)throw error;
  return data as TrainerJourneyStep;
}

export async function claimAllTrainerJourneyRewards(){
  const {data,error}=await supabase.rpc('claim_all_trainer_journey_rewards');
  if(error)throw error;
  return {
    claimedCount:Number(data?.claimedCount??0),
    coins:Number(data?.coins??0),
    diamonds:Number(data?.diamonds??0),
  };
}

export function careerTier(score:number){
  if(score>=9000)return{id:'legend',label:'Lenda',icon:'trophy',next:null as number|null,min:9000};
  if(score>=7500)return{id:'elite',label:'Elite',icon:'diamond',next:9000,min:7500};
  if(score>=5500)return{id:'veteran',label:'Veterano',icon:'shield',next:7500,min:5500};
  if(score>=3500)return{id:'specialist',label:'Especialista',icon:'star',next:5500,min:3500};
  if(score>=1500)return{id:'explorer',label:'Explorador',icon:'compass',next:3500,min:1500};
  return{id:'rookie',label:'Novato',icon:'leaf',next:1500,min:0};
}
