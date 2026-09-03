import { supabase } from '@/lib/supabase';
import { getMyActiveBattle } from '@/services/battles';
import { getMyTrades } from '@/services/trades';
import { getMySocial } from '@/services/social';
import { getGuildHub } from '@/services/guilds';
import { getMarketOffers } from '@/services/marketplace';
import { getTournamentHub } from '@/services/tournaments';
import { getMissions } from '@/services/missions';
import { getBattlePass } from '@/services/battlePass';

export type ActionableActivityCategory = 'battle'|'social'|'economy'|'progress';

export type ActionableActivity = {
  id:string;
  category:ActionableActivityCategory;
  title:string;
  body:string;
  route:string;
  status:'needs_action'|'waiting'|'ready';
  priority:number;
  createdAt:string;
};

export async function getActionableActivities():Promise<ActionableActivity[]>{
  const {data:auth}=await supabase.auth.getUser();
  const userId=auth.user?.id??'';
  if(!userId)return[];

  const [battleResult,tradesResult,socialResult,guildResult,offersResult,tournamentResult,missionsResult,passResult] = await Promise.allSettled([
    getMyActiveBattle(),
    getMyTrades(),
    getMySocial(),
    getGuildHub(),
    getMarketOffers(),
    getTournamentHub(),
    getMissions(),
    getBattlePass(),
  ]);

  const items:ActionableActivity[]=[];
  const now=new Date().toISOString();

  if(battleResult.status==='fulfilled'&&battleResult.value){
    const battle:any=battleResult.value;
    const status=String(battle.status??'');
    items.push({
      id:'battle:'+battle.id,
      category:'battle',
      title:status==='invited'?'Desafio de batalha':'Batalha em andamento',
      body:status==='invited'?'Aceite ou recuse o desafio antes que ele expire.':status==='drafting'?'O draft está aguardando sua escolha.':status==='selecting'?'Escolha seu Pokémon para continuar.':'Seu turno pode estar aguardando um golpe.',
      route:'/battle/'+battle.id,
      status:'needs_action',
      priority:100,
      createdAt:String(battle.created_at??now),
    });
  }

  if(tradesResult.status==='fulfilled'){
    for(const trade of (tradesResult.value??[]).filter((entry:any)=>entry.status==='pending').slice(0,6)){
      const mineIsSender=trade.sender_id===userId;
      const myConfirmed=mineIsSender?Boolean(trade.sender_confirmed):Boolean(trade.receiver_confirmed);
      const otherConfirmed=mineIsSender?Boolean(trade.receiver_confirmed):Boolean(trade.sender_confirmed);
      const cards=Array.isArray(trade.trade_cards)?trade.trade_cards:[];
      items.push({
        id:'trade:'+trade.id,
        category:'economy',
        title:otherConfirmed&&!myConfirmed?'Troca aguardando sua confirmação':myConfirmed?'Troca aguardando o outro treinador':'Troca em negociação',
        body:otherConfirmed&&!myConfirmed?'O outro treinador já confirmou. Revise e confirme se estiver de acordo.':myConfirmed?'Sua oferta já foi confirmada. Você pode acompanhar a resposta.':cards.length?cards.length+' item(ns) já estão na negociação.':'Adicione cartas ou saia para cancelar a troca vazia.',
        route:'/trade/'+trade.id,
        status:otherConfirmed&&!myConfirmed?'needs_action':'waiting',
        priority:otherConfirmed&&!myConfirmed?95:65,
        createdAt:String(trade.updated_at??now),
      });
    }
  }

  if(socialResult.status==='fulfilled'){
    for(const player of socialResult.value.incoming.slice(0,6)){
      items.push({
        id:'friend:'+player.id,
        category:'social',
        title:'Solicitação de amizade',
        body:'@'+player.username+' quer adicionar você.',
        route:'/friends',
        status:'needs_action',
        priority:85,
        createdAt:now,
      });
    }
  }

  if(guildResult.status==='fulfilled'){
    for(const invite of guildResult.value.myInvites.slice(0,5)){
      items.push({
        id:'guild-invite:'+String((invite as any).id??(invite as any).guildId??Math.random()),
        category:'social',
        title:'Convite de guilda',
        body:'Você recebeu um convite para '+String((invite as any).guildName??'uma guilda')+'.',
        route:'/guilds',
        status:'needs_action',
        priority:82,
        createdAt:String((invite as any).createdAt??now),
      });
    }
    if(guildResult.value.weeklyReward.claimable){
      items.push({
        id:'guild-weekly-reward',
        category:'progress',
        title:'Recompensa da guilda disponível',
        body:'A recompensa semanal da sua guilda já pode ser coletada.',
        route:'/guilds',
        status:'ready',
        priority:88,
        createdAt:now,
      });
    }
    if(guildResult.value.collectiveBooster.claimable){
      items.push({
        id:'guild-booster-ready',
        category:'progress',
        title:'Booster coletivo pronto',
        body:'Sua guilda completou o objetivo coletivo desta semana.',
        route:'/guilds',
        status:'ready',
        priority:86,
        createdAt:now,
      });
    }
  }

  if(offersResult.status==='fulfilled'){
    for(const offer of offersResult.value.incoming.filter((entry)=>entry.status==='pending').slice(0,8)){
      items.push({
        id:'market-offer:'+offer.id,
        category:'economy',
        title:'Oferta recebida no Marketplace',
        body:'@'+offer.buyerUsername+' ofereceu '+offer.amountCoins.toLocaleString('pt-BR')+' coins por '+offer.card.name+'.',
        route:'/market-offers',
        status:'needs_action',
        priority:92,
        createdAt:offer.createdAt,
      });
    }
  }

  if(tournamentResult.status==='fulfilled'){
    const tournament=tournamentResult.value;
    if(tournament.joined&&tournament.status==='active'){
      const ready=tournament.matches.find((match)=>(match.status==='ready'||match.status==='playing')&&(match.playerA?.id===userId||match.playerB?.id===userId));
      if(ready){
        items.push({
          id:'tournament-match:'+ready.id,
          category:'battle',
          title:'Partida da Copa Trainer pronta',
          body:'Sua partida do torneio está '+(ready.status==='playing'?'em andamento':'pronta para começar')+'.',
          route:ready.battleId?'/battle/'+ready.battleId:'/tournaments',
          status:'needs_action',
          priority:98,
          createdAt:now,
        });
      }
    }
  }

  if(missionsResult.status==='fulfilled'){
    const claimable=missionsResult.value.filter((mission)=>!mission.claimed&&mission.progress>=mission.target);
    if(claimable.length){
      items.push({
        id:'missions-claimable',
        category:'progress',
        title:claimable.length+' missão(ões) concluída(s)',
        body:'Há recompensa pronta para resgatar em Missões.',
        route:'/missions',
        status:'ready',
        priority:84,
        createdAt:now,
      });
    }
  }

  if(passResult.status==='fulfilled'&&passResult.value){
    const pass=passResult.value;
    const claimable=pass.rewards.filter((reward)=>!reward.claimed&&reward.level<=pass.progress.level&&(reward.track==='free'||pass.progress.vipUnlocked));
    if(claimable.length){
      items.push({
        id:'battle-pass-claimable',
        category:'progress',
        title:'Recompensa do Passe disponível',
        body:claimable.length+' recompensa(s) podem ser coletadas agora.',
        route:'/battle-pass',
        status:'ready',
        priority:83,
        createdAt:now,
      });
    }
  }

  const unique=new Map<string,ActionableActivity>();
  for(const item of items){
    if(!unique.has(item.id))unique.set(item.id,item);
  }
  return [...unique.values()].sort((a,b)=>b.priority-a.priority||b.createdAt.localeCompare(a.createdAt)).slice(0,30);
}
