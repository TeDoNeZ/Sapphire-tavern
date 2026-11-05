import {cards, makeUnit, isTribe, canMagnetize} from './cards.js';
import {SPELL_TABLE, spellTiers} from './spells.js';
import {applySpellEffect} from './spell-effects.js';

export const MAX_BOARD = 8, MAX_HAND = 15;
const COST = [0,5,7,8,9,10,11,12,0];
const copy = x => JSON.parse(JSON.stringify(x));
const pick = a => a[Math.floor(Math.random()*a.length)];
const ok = message => ({ok:true,message});
const fail = message => ({ok:false,message});
// Текущие племена импортированы из archive/legacy-assets.
export const ARCHETYPES = ['beast','mech','pirate','naga'];
const randomArchetypes = () => [...ARCHETYPES].sort(()=>Math.random()-.5).slice(0,4);
const pool = (tier, tribe, allowed=ARCHETYPES) => cards.filter(c => c.tier <= tier && (!tribe || isTribe(c,tribe)) && (!allowed?.length || (c.tribes||[c.tribe]).some(t=>allowed.includes(t))) && !c.token && !c.isSpell && !c.removed && !c.disabled);
const buff = (u,a=0,h=0) => { if(u){u.attack+=a;u.health+=h;u.maxHealth+=h;} };
const has = (u,k) => u.keywords.includes(k) || u.gifts.some(g=>g.type===k);
const keyword = (u,k) => {if(!u.keywords.includes(k))u.keywords.push(k);};
const group = (s,t) => s.board.filter(u=>isTribe(u,t));
const undeadBonus = s => s.undeadGlobal || (s.undeadGlobal={attack:0,health:0});
const applyUndeadTo = (s,u) => {if(isTribe(u,'undead')){const g=undeadBonus(s);buff(u,g.attack,g.health);}return u;};
const globalUndeadBuff = (s,a=0,h=0) => {const g=undeadBonus(s);g.attack+=a;g.health+=h;for(const u of [...s.board,...s.hand,...s.shop])if(isTribe(u,'undead'))buff(u,a,h);};
const base = u => makeUnit(u.id,u.rank);
const give = (s,u) => {if(u && s.hand.length<MAX_HAND){s.hand.push(u);return true;} return false;};
const randomCard = (s,t,filter=()=>true) => {const c=pick(pool(s.tier,t,s.archetypes).filter(filter));return c?applyUndeadTo(s,makeUnit(c.id)):null;};
function token(type,a,h,keywords=[]){const id=type==='beast'?(keywords.includes('taunt')?'guard_beast':'pack_beast'):type;const u=makeUnit(id);u.attack=a;u.health=h;u.maxHealth=h;u.keywords=[...new Set([...u.keywords,...keywords])];return u;}
function beastSummon(s,u){
 if(u.tribe!=='beast')return;
 for(const source of [...s.board]){
  if(source.uid===u.uid)continue;
  const r=source.rank;
  if(['b06','b14','b22'].includes(source.id)){const n=source.id==='b06'?1:source.id==='b14'?2:3;buff(u,n*r,n*r);}
  if(source.id==='b17')s.board.forEach(x=>buff(x,2*r,r));
  if(source.id==='b18' && (source.recruitSummons||0)<2*r){source.recruitSummons=(source.recruitSummons||0)+1;buff(u,2*r,2*r);keyword(u,'reborn');}
 }
}
function summon(s,u,position=s.board.length){if(!u||s.board.length>=MAX_BOARD)return false;const index=Number.isInteger(position)?Math.max(0,Math.min(position,s.board.length)):s.board.length;s.board.splice(index,0,u);beastSummon(s,u);return true;}
function summonBeetle(s,a=1,h=1,keys=[]){const u=token('beetle',a+s.beetle.attack,h+s.beetle.health,keys);u.gifts=copy(s.beetle.gifts);summon(s,u);}
function beetleBuff(s,a,h){s.beetle.attack+=a;s.beetle.health+=h; s.board.filter(u=>u.id==='beetle').forEach(u=>buff(u,a,h));}
function beetleGift(s,g){s.beetle.gifts.push(copy(g));s.board.filter(u=>u.id==='beetle').forEach(u=>u.gifts.push(copy(g)));}
function rollSpell(s,lastSpellId=null){
 const tiers=spellTiers(s.tier);const pool=Object.entries(SPELL_TABLE).filter(([id,x])=>tiers.includes(x.tier)&&!(lastSpellId&&id===lastSpellId&&x.weight<=1));
 if(!pool.length)return null;const total=pool.reduce((n,[,x])=>n+(x.weight||1),0);let roll=Math.random()*total;
 for(const [id,x] of pool){roll-=x.weight||1;if(roll<=0)return {id,kind:'spell',...x,uid:`spell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,instanceId:`spell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`};}
 const [id,x]=pool.at(-1);return {id,kind:'spell',...x,uid:`spell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,instanceId:`spell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`};
}
function refreshShop(s){s.shop=Array.from({length:[0,3,4,4,5,5,6,6,7][s.tier]},()=>applyUndeadTo(s,makeUnit(pick(pool(s.tier,null,s.archetypes)).id)));}
function refreshSpellShop(s){const out=[];let last=null;for(let i=0;i<Math.min(2,s.shop.length);i++){const spell=rollSpell(s,last);if(spell){out.push(spell);last=spell.id;}}s.spellShop=out;}
function queueDiscover(s,options){if(!options.length)return;if(s.discover.length)s.discoverQueue.push(options);else s.discover=options;}
function offer(s,tier,tribe,exact=false){const candidates=pool(tier,tribe,s.archetypes).filter(c=>!exact||c.tier===tier);const out=[];while(out.length<3 && candidates.length){const i=Math.floor(Math.random()*candidates.length);out.push(applyUndeadTo(s,makeUnit(candidates.splice(i,1)[0].id)));}queueDiscover(s,out);}
function triples(s){
 let changed=true;
 while(changed){changed=false;for(const rank of [1,2]){
  const units=[...s.board,...s.hand].filter(u=>u.rank===rank&&!u.token&&!u.id.startsWith('token_'));
  const found=units.find(u=>units.filter(v=>v.id===u.id).length>=3);if(!found)continue;
  const trio=units.filter(u=>u.id===found.id).slice(0,3);const ids=new Set(trio.map(u=>u.uid));
  const merged=makeUnit(found.id,rank*2);
  for(const u of trio){const b=base(u);buff(merged,u.attack-b.attack,u.maxHealth-b.maxHealth);for(const k of u.keywords)keyword(merged,k);
   const intrinsic=copy(b.gifts);for(const gift of u.gifts){const i=intrinsic.findIndex(g=>JSON.stringify(g)===JSON.stringify(gift));if(i>=0)intrinsic.splice(i,1);else merged.gifts.push(copy(gift));}
   merged.tempAttack=(merged.tempAttack||0)+(u.tempAttack||0);merged.tempHealth=(merged.tempHealth||0)+(u.tempHealth||0);
  }
  merged.tripleRewards=1+trio.reduce((a,u)=>a+(u.tripleRewards||0),0);
  s.board=s.board.filter(u=>!ids.has(u.uid));s.hand=s.hand.filter(u=>!ids.has(u.uid));
  // If all three were on board while hand is full, keep the merged unit there.
  if(!give(s,merged))s.board.push(merged);
  changed=true;break;
 }}
}
function death(s,u,silent=false){
 const i=s.board.findIndex(x=>x.uid===u.uid);if(i<0)return;s.board.splice(i,1);if(silent)return;
 const r=u.rank||1, reborn=has(u,'reborn');
 for(const legion of s.board.filter(x=>x.id==='u11')){legion.deathCounter=(legion.deathCounter||0)+1;buff(legion,2*legion.rank,legion.rank);}
  for(const witness of [...s.board]){
  const wr=witness.rank;
  if(witness.id==='u14'&&reborn)group(s,'undead').forEach(x=>buff(x,wr,wr));
  const threshold={u09:2,u13:3,u20:5,u22:4,u25:5,u26:4,u27:5,b16:1}[witness.id];
  if(threshold){witness.recruitAvenge=(witness.recruitAvenge||0)+1;if(witness.recruitAvenge%threshold===0){
   if(witness.id==='u09')buff(pick(group(s,'undead')),wr,wr);
   if(witness.id==='u13'){summon(s,token('skeleton',wr,wr));}
    if(witness.id==='u26'){const t=makeUnit('u11',witness.rank);t.deathCounter=witness.deathCounter||0;buff(t,2*t.deathCounter,t.deathCounter);summon(s,t);}
   if(witness.id==='u20')globalUndeadBuff(s,wr,wr);
   if(witness.id==='u22')for(let n=0;n<wr;n++)give(s,randomCard(s,'undead'));
   if(witness.id==='u25'){const t=pick(s.board.filter(x=>x.uid!==witness.uid));if(t)keyword(t,'reborn');}
    if(witness.id==='u27')give(s,{kind:'spell',id:'s_destroy_undead',name:'Уничтожение',type:'destroy_undead',cost:0,uid:`spell-destroy-${Date.now()}`});
    if(witness.id==='b16')beetleBuff(s,wr,wr);
  }}
 }
 if(['u01'].includes(u.id))summon(s,token('skeleton',r,r));
 if(u.id==='u02')summon(s,token('skeleton',r,r));
  if(u.id==='u07')for(let n=0;n<3*r;n++)summon(s,token('skeleton',r,r));
  if(u.id==='u06'){const target=pick(group(s,'undead'));if(target)buff(target,r,0);}
 if(u.id==='u12')for(let n=0;n<r;n++){const t=pick(group(s,'undead').filter(x=>!has(x,'reborn')));if(t)keyword(t,'reborn');}
  if(u.id==='u17')for(let n=0;n<r;n++)summon(s,randomCard(s,'undead'));
 if(u.id==='m17')for(let n=0;n<r;n++)give(s,randomCard(s,'mech',c=>c.keywords.includes('magnetic')));
 if(['b01','b07','b19'].includes(u.id)){const count=u.id==='b01'?1:u.id==='b07'?2:3;const n=u.id==='b19'?3:1;for(let j=0;j<count;j++)summon(s,token('spider',n*r,n*r));}
 if(['b05','b11'].includes(u.id))summonBeetle(s,r,r);
 if(u.id==='b13')for(let n=0;n<r;n++)summon(s,randomCard(s,'beast'));
 if(u.id==='b15')summon(s,token('beast',2*r,2*r,['taunt']));
 if(u.id==='b20')summonBeetle(s,r,r,['reborn']);
 if(u.id==='b23')while(s.board.length<MAX_BOARD)summon(s,token('beast',4*r,4*r));
 if(u.id==='b24')for(let n=0;n<3;n++)summonBeetle(s,r,r,['taunt']);
 for(const g of u.gifts)if(g.type==='death_beetle')summonBeetle(s,g.attack||1,g.health||1);
 if(reborn){let count=1;for(const necro of s.board.filter(x=>x.id==='u29'))if((necro.recruitReborn||0)<necro.rank){necro.recruitReborn=(necro.recruitReborn||0)+1;count++;}
  for(let n=0;n<count;n++){const revived=base(u);revived.health=1;revived.maxHealth=1;revived.keywords=revived.keywords.filter(k=>k!=='reborn');revived.gifts=revived.gifts.filter(g=>g.type!=='reborn');summon(s,revived);}
 }
}
function battlecry(s,u,target,choice){
 const r=u.rank;
 
 if(u.id==='u05')globalUndeadBuff(s,r,0);
 if(false&&u.id==='u12'){for(let n=0;n<r;n++){const t=pick(group(s,'undead').filter(x=>!has(x,'reborn')));if(t)keyword(t,'reborn');}}
 if(u.id==='u21'&&target){const reborn=has(target,'reborn');death(s,target);globalUndeadBuff(s,5*r,0);}
 if(u.id==='u19')globalUndeadBuff(s,2*r,2*r);
 if(u.id==='u23')for(let n=0;n<r;n++)give(s,{kind:'spell',id:'s_undead_excavate',name:'Раскопка (нежить)',type:'undead_excavate',target:'global',cost:0,text:'Выберите одну из трёх карт нежити вашей таверны или ниже.',uid:`spell-undead-${Date.now()}-${n}`});
 if(false&&u.id==='u25'){const n=group(s,'undead').length;for(let i=0;i<n;i++)summon(s,token('skeleton',2*r,2*r));}
 if(false&&u.id==='u28'){const victims=group(s,'undead').filter(x=>x.uid!==u.uid);const a=victims.reduce((v,x)=>v+x.attack,0),h=victims.reduce((v,x)=>v+x.health,0);for(const v of victims)death(s,v);buff(u,Math.floor(a/2)*r,Math.floor(h/2)*r);}
 if(u.id==='m07')buff(pick(group(s,'mech').filter(x=>x.uid!==u.uid)),r,r);
 if(['m11','m22'].includes(u.id)&&target){buff(u,target.attack*r,target.health*r);if(u.id!=='m22')death(s,target,true);}
 if(u.id==='b05')beetleBuff(s,2*r,2*r);
 if(u.id==='b10'&&target){keyword(target,choice);target.gifts.push({type:choice});}
 if(u.id==='b21')beetleGift(s,{type:'death_beetle',attack:2*r,health:2*r});
 if(u.id==='b25')beetleGift(s,{type:'death_beetle',attack:r,health:r});
}
function mechBefore(s,u,sources){
 if(!isTribe(u,'mech'))return;
 for(const x of sources){for(const g of x.gifts)if(g.type==='future_mech_buff')buff(u,g.attack??g.amount??1,g.health??g.amount??1);
 if(x.id==='m12')buff(u,2*x.rank,2*x.rank);}
}
function mechAfter(s,u,sources,target=null){if(!isTribe(u,'mech'))return;const recipient=s.board.includes(u)?u:target;if(!recipient||!isTribe(recipient,'mech'))return;for(const x of sources.filter(x=>x.id==='m25'&&s.board.includes(x))){x.colossusCount=(x.colossusCount||0)+1;buff(recipient,2*x.rank*x.colossusCount,2*x.rank*x.colossusCount);}}
function attach(target,u){buff(target,u.attack,u.health);target.gifts.push(...copy(u.gifts));target.tempAttack=(target.tempAttack||0)+(u.tempAttack||0);target.tempHealth=(target.tempHealth||0)+(u.tempHealth||0);for(const g of u.gifts)if(['reborn','windfury'].includes(g.type))keyword(target,g.type);}
export function newGame(){const s={round:1,gold:3,runes:0,tier:1,health:40,wins:0,defeats:0,board:[],hand:[],shop:[],spellShop:[],frozen:false,archetypes:randomArchetypes(),admin:{infiniteGold:false,infiniteHealth:false},beetle:{attack:0,health:0,gifts:[]},undeadGlobal:{attack:0,health:0},discover:[],discoverQueue:[],upgradeCost:5,maxGoldBonus:0,deferredGold:0};refreshShop(s);refreshSpellShop(s);return s;}
export function buy(s,index){if(!Number.isInteger(index)||!s.shop[index])return fail('Нет такой карты');if(!s.admin?.infiniteGold&&s.gold<3)return fail('Нужно 3 золота');if(s.hand.length>=MAX_HAND)return fail('В руке уже 15 карт');if(!s.admin?.infiniteGold)s.gold-=3;s.hand.push(s.shop.splice(index,1)[0]);triples(s);return ok('Карта куплена');}
export function buySpell(s,index){if(!Number.isInteger(index)||!s.spellShop?.[index])return fail('Нет такого заклинания');const spell=s.spellShop[index];if(!s.admin?.infiniteGold&&s.gold<spell.cost)return fail(`Нужно ${spell.cost} золота`);if(s.hand.length>=MAX_HAND)return fail('В руке уже 15 карт');if(!s.admin?.infiniteGold)s.gold-=spell.cost;s.hand.push(s.spellShop.splice(index,1)[0]);return ok('Заклинание куплено');}
export function castSpell(s,index,targetUid=null){
 if(!Number.isInteger(index)||!s.hand[index])return fail('Нет такой карты в руке');const spell=s.hand[index];if(spell.kind!=='spell')return fail('Это не заклинание');
 const target=targetUid?s.board.find(u=>u.uid===targetUid):null;
 const outcome=applySpellEffect(spell,target,s,{maxBoard:MAX_BOARD,maxHand:MAX_HAND,destroyUnit:(state,unit)=>death(state,unit),rollShopFn:()=>{refreshShop(s);refreshSpellShop(s);return s.shop;}});
 if(!outcome.ok)return outcome; s.hand.splice(index,1);triples(s);return outcome;
}

export function play(s,index,targetUid=null,mode='play',choice='reborn',position=null){

 if(!Number.isInteger(index)||!s.hand[index])return fail('Нет такой карты в руке');
 const u=s.hand[index],target=s.board.find(x=>x.uid===targetUid),magnet=['magnetic','magnetize'].includes(mode);
 if(u.kind==='spell')return fail('Заклинание нужно применить кнопкой «Разыграть заклинание»');
 if(!['play','magnetic','magnetize'].includes(mode))return fail('Неизвестный способ розыгрыша');
 if(magnet){if(!canMagnetize(u,target))return fail('Для магнетизма выберите механизм (Носитель может выбрать нежить)');}
 else{
  if(s.board.length>=MAX_BOARD)return fail('На поле уже 8 существ');
   if(position!==null&&(!Number.isInteger(position)||position<0||position>=MAX_BOARD))return fail('Неверная позиция на поле');
  const tribe={u16:'undead',u21:'undead',m11:'mech',m22:'mech',m27:'mech',b10:'beast'}[u.id];
  if(tribe && s.board.some(x=>isTribe(x,tribe)) && (!target||!isTribe(target,tribe)))return fail(`Выберите цель: ${tribe}`);
  if(tribe && target && !isTribe(target,tribe))return fail('Неподходящая цель');
  if(u.id==='b10'&&!['reborn','windfury'].includes(choice))return fail('Выберите перерождение или неистовые ветра');
 }
 const sources=[...s.board];s.hand.splice(index,1);mechBefore(s,u,sources);
 if(magnet){attach(target,u);for(const thief of sources.filter(x=>x.id==='m26'&&x.uid!==target.uid))for(let n=0;n<thief.rank;n++)attach(thief,u);}
 else{summon(s,u,position===null?s.board.length:Math.min(position,s.board.length));battlecry(s,u,target,choice);}
 mechAfter(s,u,sources,target);
 for(let n=0;n<(u.tripleRewards||0);n++)offer(s,Math.min(8,s.tier+1),null,true);
 delete u.tripleRewards;triples(s);return ok(magnet?'Механизм примагничен':'Существо разыграно');
}
export function sell(s,uid){const i=s.board.findIndex(u=>u.uid===uid);if(i<0)return fail('Существо не найдено');const u=s.board.splice(i,1)[0];s.gold++;for(let n=0;n<(u.tripleRewards||0);n++)offer(s,Math.min(8,s.tier+1),null,true);return ok('Продано за 1 золото');}
export function reroll(s){if(!s.admin?.infiniteGold&&s.gold<1)return fail('Нужно 1 золото');if(!s.admin?.infiniteGold)s.gold--;s.frozen=false;refreshShop(s);refreshSpellShop(s);return ok('Таверна обновлена');}
export function upgrade(s){if(s.tier>=8)return fail('Максимальная таверна');if(!s.admin?.infiniteGold&&s.gold<s.upgradeCost)return fail('Недостаточно золота');if(!s.admin?.infiniteGold)s.gold-=s.upgradeCost;s.tier++;s.upgradeCost=COST[s.tier];return ok('Таверна улучшена');}
export function freeze(s){s.frozen=!s.frozen;return ok(s.frozen?'Таверна заморожена':'Заморозка снята');}
export function reorder(s,from,to){if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=s.board.length||to>=MAX_BOARD)return fail('Неверная позиция');const [u]=s.board.splice(from,1);s.board.splice(Math.min(to,s.board.length),0,u);return ok('Порядок изменён');}
export function discover(s,index){if(!Number.isInteger(index)||!s.discover[index])return fail('Неверный вариант раскопки');if(s.hand.length>=MAX_HAND)return fail('Освободите место в руке');s.hand.push(s.discover[index]);s.discover=s.discoverQueue.shift()||[];triples(s);return ok('Карта раскопана');}
export function nextRound(s,result={}){
 for(const p of result.permanent||[]){const u=[...s.board,...s.hand].find(x=>x.uid===p.uid);if(u){buff(u,p.attack||0,p.health||0);for(const k of p.keywords||[])keyword(u,k);}}
 if(result.undeadGlobal)globalUndeadBuff(s,result.undeadGlobal.attack||0,result.undeadGlobal.health||0);
  for(const id of result.rewards||[]){if(cards.some(c=>c.id===id))give(s,applyUndeadTo(s,makeUnit(id)));}
 if(result.beetleDelta)beetleBuff(s,result.beetleDelta.attack||0,result.beetleDelta.health||0);
 let reset=false;
 if(['player','win',0].includes(result.winner))s.wins++;
 else if(['enemy','loss',1].includes(result.winner)){if(!s.admin?.infiniteHealth)s.health-=Math.max(1,result.damage??result.heroDamage??Math.min(15,3+Math.floor(s.round/3)));if(s.health<=0&&!s.admin?.infiniteHealth){s.defeats++;s.health=40;reset=true;}}
 for(const u of [...s.board,...s.hand]){buff(u,-(u.tempAttack||0),-(u.tempHealth||0));u.tempAttack=0;u.tempHealth=0;delete u.recruitSummons;delete u.recruitReborn;delete u.recruitAvenge;}
 s.round++;s.runes=(s.runes||0)+1;s.gold=Math.min(10+(s.maxGoldBonus||0),s.round+2+(s.maxGoldBonus||0));if(s.admin?.infiniteGold)s.gold=999;if(s.deferredGold){s.gold+=s.deferredGold;s.deferredGold=0;}s.upgradeCost=Math.max(0,s.upgradeCost-1);
 for(const u of s.board)for(const g of u.gifts){
  if(g.type==='turn_gold')s.gold+=g.amount??1;
  if(g.type==='turn_self_buff')buff(u,g.attack??1,g.health??1);
  if(g.type==='turn_mechs_buff')for(const t of group(s,'mech')){const a=g.attack??2,h=g.health??2;buff(t,a,h);t.tempAttack=(t.tempAttack||0)+a;t.tempHealth=(t.tempHealth||0)+h;}
 }
 if(s.frozen){while(s.shop.length<[0,3,4,4,5,5,6,6,7][s.tier])s.shop.push(makeUnit(pick(pool(s.tier,null,s.archetypes)).id));s.frozen=false;}else refreshShop(s);
 triples(s);return ok(`Раунд ${s.round}. Доход получен.${reset?' Поражение: здоровье восстановлено до 40, прогресс сохранён.':''}`);
}
export function makeEnemy(s){
  // В начале рост мягкий, затем ускоряется геометрически: +12% за раунд.
  const growth=Math.pow(1.16,Math.max(0,s.round-1));
  const tier=Math.min(8,1+Math.floor((s.round-1)/3));
  const size=Math.min(8,Math.max(1,Math.floor(1.2+growth*.6)));
  const theme=pick((s.archetypes||['undead','mech','beast']));
  const bonus=Math.min(1e9,Math.floor(5*(growth-1)));
  return Array.from({length:size},()=>{
    const options=pool(tier,Math.random()<.8?theme:null,s.archetypes);
    const u=makeUnit(pick(options).id,s.round>=24&&Math.random()<.16?4:s.round>=8&&Math.random()<Math.min(.42,.18+s.round/100)?2:1);
    buff(u,bonus,bonus);return u;
  });
}
