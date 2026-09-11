import { supabase } from '@/lib/supabase';
import { withReadRetry } from '@/lib/readRetry';

export type PlayerGoalType = 'collection'|'pokemon'|'rank'|'battle'|'coins'|'custom';

export type PlayerGoal = {
  id:string;
  goalType:PlayerGoalType;
  title:string;
  targetValue:number;
  currentValue:number;
  route:string|null;
  metadata:Record<string,unknown>;
  status:'active'|'completed'|'archived';
  createdAt:string;
  updatedAt:string;
};

export type OnboardingStep = {
  id:string;
  title:string;
  description:string;
  done:boolean;
  route:string;
};

export type OnboardingProgress = {
  completed:number;
  total:number;
  allDone:boolean;
  steps:OnboardingStep[];
};

export type PostgameRoundInsight = {
  round:number;
  won:boolean;
  myCardId:string|null;
  enemyCardId:string|null;
  myCardName:string|null;
  enemyCardName:string|null;
  myPower:number|null;
  enemyPower:number|null;
  myCombat:Record<string,unknown>|null;
  enemyCombat:Record<string,unknown>|null;
};

export type PostgameInsights = {
  battleId:string;
  won:boolean;
  status:string;
  mode:string;
  engineVersion:string|null;
  myScore:number;
  enemyScore:number;
  ratingBefore:number|null;
  ratingAfter:number|null;
  ratingDelta:number;
  rewardEligible:boolean;
  forfeited:boolean;
  reason:string;
  wonRounds:number;
  lostRounds:number;
  rounds:PostgameRoundInsight[];
  replayRoute:string;
};

export async function getMyGoals():Promise<PlayerGoal[]>{
  const {data,error}=await withReadRetry(()=>supabase.rpc('get_my_goals'));
  if(error)throw error;
  return Array.isArray(data)?data.map((row:any)=>({
    id:String(row.id),
    goalType:String(row.goalType) as PlayerGoalType,
    title:String(row.title??'Meta'),
    targetValue:Number(row.targetValue??1),
    currentValue:Number(row.currentValue??0),
    route:row.route?String(row.route):null,
    metadata:row.metadata&&typeof row.metadata==='object'?row.metadata:{},
    status:String(row.status??'active') as PlayerGoal['status'],
    createdAt:String(row.createdAt??''),
    updatedAt:String(row.updatedAt??''),
  })):[];
}

export async function createPlayerGoal(input:{
  goalType:PlayerGoalType;
  title:string;
  targetValue:number;
  route?:string|null;
  metadata?:Record<string,unknown>;
}){
  const {data:auth}=await supabase.auth.getUser();
  const playerId=auth.user?.id;
  if(!playerId)throw new Error('Sessão não encontrada.');
  const {data,error}=await supabase.from('player_goals').insert({
    player_id:playerId,
    goal_type:input.goalType,
    title:input.title.trim().slice(0,80),
    target_value:Math.max(1,Math.floor(input.targetValue)),
    route:input.route??null,
    metadata:input.metadata??{},
  }).select('id').single();
  if(error)throw error;
  return String(data.id);
}

export async function setCustomGoalProgress(goalId:string,progress:number){
  const {error}=await supabase.from('player_goals')
    .update({progress:Math.max(0,Math.floor(progress)),updated_at:new Date().toISOString()})
    .eq('id',goalId)
    .eq('goal_type','custom');
  if(error)throw error;
}

export async function archivePlayerGoal(goalId:string){
  const {error}=await supabase.from('player_goals')
    .update({status:'archived',updated_at:new Date().toISOString()})
    .eq('id',goalId);
  if(error)throw error;
}

export async function getMyOnboardingProgress():Promise<OnboardingProgress>{
  const {data,error}=await withReadRetry(()=>supabase.rpc('get_my_onboarding_progress'));
  if(error)throw error;
  const value:any=data??{};
  return {
    completed:Number(value.completed??0),
    total:Number(value.total??5),
    allDone:Boolean(value.allDone),
    steps:Array.isArray(value.steps)?value.steps.map((step:any)=>({
      id:String(step.id),
      title:String(step.title??'Etapa'),
      description:String(step.description??''),
      done:Boolean(step.done),
      route:String(step.route??'/(tabs)/index'),
    })):[],
  };
}

export async function getBattlePostgameInsights(battleId:string):Promise<PostgameInsights>{
  const {data,error}=await withReadRetry(()=>supabase.rpc('get_battle_postgame_insights',{p_battle_id:battleId}));
  if(error)throw error;
  const value:any=data??{};
  return {
    battleId:String(value.battleId??battleId),
    won:Boolean(value.won),
    status:String(value.status??''),
    mode:String(value.mode??''),
    engineVersion:value.engineVersion?String(value.engineVersion):null,
    myScore:Number(value.myScore??0),
    enemyScore:Number(value.enemyScore??0),
    ratingBefore:value.ratingBefore==null?null:Number(value.ratingBefore),
    ratingAfter:value.ratingAfter==null?null:Number(value.ratingAfter),
    ratingDelta:Number(value.ratingDelta??0),
    rewardEligible:Boolean(value.rewardEligible),
    forfeited:Boolean(value.forfeited),
    reason:String(value.reason??'Revise o replay para entender os momentos decisivos.'),
    wonRounds:Number(value.wonRounds??0),
    lostRounds:Number(value.lostRounds??0),
    rounds:Array.isArray(value.rounds)?value.rounds.map((round:any)=>({
      round:Number(round.round??0),
      won:Boolean(round.won),
      myCardId:round.myCardId?String(round.myCardId):null,
      enemyCardId:round.enemyCardId?String(round.enemyCardId):null,
      myCardName:round.myCardName?String(round.myCardName):null,
      enemyCardName:round.enemyCardName?String(round.enemyCardName):null,
      myPower:round.myPower==null?null:Number(round.myPower),
      enemyPower:round.enemyPower==null?null:Number(round.enemyPower),
      myCombat:round.myCombat&&typeof round.myCombat==='object'?round.myCombat:null,
      enemyCombat:round.enemyCombat&&typeof round.enemyCombat==='object'?round.enemyCombat:null,
    })):[],
    replayRoute:String(value.replayRoute??('/battle-replay/'+battleId)),
  };
}
