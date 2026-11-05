import {makeUnit, isTribe, canMagnetize} from './cards.js';

const result=(ok,message,highlight=false)=>({ok,message,highlight});
const buff=(u,a=0,h=0)=>{u.attack+=a;u.health+=h;u.maxHealth+=h;};
const keyword=(u,k)=>{u.keywords=[...(u.keywords||[])];if(!u.keywords.includes(k))u.keywords.push(k);};
const clone=v=>JSON.parse(JSON.stringify(v));
function baseCopy(card){return makeUnit(card.id,1);}
function fullCopy(card,rank=card.rank){const copy=makeUnit(card.id,rank);copy.attack=card.attack;copy.health=card.health;copy.maxHealth=card.maxHealth;copy.keywords=clone(card.keywords||[]);copy.gifts=clone(card.gifts||[]);copy.tempAttack=card.tempAttack||0;copy.tempHealth=card.tempHealth||0;return copy;}
function putCopy(copy,state,maxBoard,maxHand){if(state.board.length<maxBoard){state.board.push(copy);return true;}if(state.hand.length<maxHand){state.hand.push(copy);return true;}return false;}

export function applySpellEffect(spell,targetCard,state,{maxBoard=8,maxHand=15,rollShopFn=()=>[],rng=Math.random,destroyUnit=null}={}){
 switch(spell?.type){
  case 'grant_keyword':if(!targetCard)return result(false,'Выберите существо');keyword(targetCard,spell.keyword);if(spell.keyword==='windfury')targetCard.gifts.push({type:'windfury'});return result(true,`${spell.name}: «${targetCard.name}» получил свойство`);
  case 'buff':{const targets=spell.target==='all'?state.board:(targetCard?[targetCard]:[]);if(!targets.length)return result(false,'Нет подходящих существ');targets.forEach(u=>buff(u,spell.atk||0,spell.hp||0));return result(true,`${spell.name}: усиление применено`,spell.tier>=5);}
  case 'buff_and_keyword':if(!targetCard)return result(false,'Выберите существо');buff(targetCard,spell.atk||0,spell.hp||0);keyword(targetCard,spell.keyword);return result(true,`${spell.name}: усиление и свойство применены`,spell.tier>=5);
  case 'gold':state.gold+=spell.amount||0;return result(true,`${spell.name}: +${spell.amount||0} золота`);
  case 'free_reroll':state.shop=rollShopFn(state);return result(true,`${spell.name}: лавка обновлена`);
  case 'deferred_gold':state.gold+=spell.now||0;state.deferredGold=(state.deferredGold||0)+(spell.later||0);return result(true,`${spell.name}: +${spell.now||0} золота сейчас и +${spell.later||0} в следующем раунде`);
  case 'maxgold':state.maxGoldBonus=(state.maxGoldBonus||0)+1;return result(true,`${spell.name}: максимум золота увеличен`,true);
  case 'duplicate_base':if(!targetCard)return result(false,'Выберите существо');if(state.hand.length>=maxHand)return result(false,'Рука заполнена — копия не помещается');state.hand.push(baseCopy(targetCard));return result(true,`${spell.name}: базовая копия в руке`);
  case 'double':if(!targetCard)return result(false,'Выберите существо');if(!putCopy(fullCopy(targetCard,1),state,maxBoard,maxHand))return result(false,'Нет места ни на столе, ни в руке');return result(true,`${spell.name}: копия создана`,true);
  case 'duplicate_eternal':if(!targetCard)return result(false,'Выберите существо');if(targetCard.rank===4)return result(false,'Нельзя копировать сапфировое существо');if(!putCopy(fullCopy(targetCard),state,maxBoard,maxHand))return result(false,'Нет места ни на столе, ни в руке');return result(true,`${spell.name}: копия создана`,true);
  case 'absorb':{if(!targetCard)return result(false,'Выберите существо');const others=state.board.filter(u=>u!==targetCard);if(!others.length)return result(false,'Нужно ещё одно существо для передачи статов');if(!destroyUnit)return result(false,'Уничтожение недоступно');const victim=others[Math.floor(rng()*others.length)];buff(victim,targetCard.attack,targetCard.health);destroyUnit(state,targetCard);return result(true,`«${targetCard.name}» поглощён`,true);}
  case 'random_buff':if(!state.board.length)return result(false,'Нет существ на столе');{const u=state.board[Math.floor(rng()*state.board.length)];buff(u,spell.atk||0,spell.hp||0);return result(true,`${spell.name}: «${u.name}» получил усиление`);}
  case 'sacrifice':{if(!targetCard)return result(false,'Выберите существо');const i=state.board.indexOf(targetCard);if(i<0)return result(false,'Цель не найдена на столе');const n=[state.board[i-1],state.board[i+1]].filter(Boolean);if(!n.length)return result(false,'Нужен хотя бы один сосед');const a=n.length===1?targetCard.attack:Math.floor(targetCard.attack/2),h=n.length===1?targetCard.health:Math.floor(targetCard.health/2);if(!destroyUnit)return result(false,'Уничтожение недоступно');n.forEach(u=>buff(u,a,h));destroyUnit(state,targetCard);return result(true,`${spell.name}: статы переданы соседям`,true);}
  case 'goldify':{if(!targetCard)return result(false,'Выберите существо');if(targetCard.rank!==1)return result(false,'Можно озолотить только обычное существо');const base=makeUnit(targetCard.id,1),gold=makeUnit(targetCard.id,2);const ba=targetCard.attack-base.attack,bh=targetCard.health-base.health;targetCard.rank=2;targetCard.attack=gold.attack+ba;targetCard.health=gold.health+bh;targetCard.maxHealth=gold.maxHealth+bh;return result(true,`${spell.name}: «${targetCard.name}» стал золотым`,true);}
  case 'undead_excavate':{const options=rollShopFn(state).filter(u=>isTribe(u,'undead')).slice(0,3);if(!options.length)return result(false,'Нет карт нежити для раскопки');state.discover=options;return result(true,'Раскопка: выберите карту нежити',true);}
   case 'destroy_undead':{if(!targetCard)return result(false,'Выберите существо');if(!isTribe(targetCard,'undead'))return result(false,'Нужна нежить');const i=state.board.indexOf(targetCard);if(i<0)return result(false,'Цель не найдена на столе');if(!destroyUnit)return result(false,'Уничтожение недоступно');destroyUnit(state,targetCard);state.undeadGlobal??={attack:0,health:0};state.undeadGlobal.attack+=5;for(const u of [...state.board,...state.hand,...state.shop])if(isTribe(u,'undead'))buff(u,5,0);return result(true,`${spell.name}: существо уничтожено`,true);}
   default:return result(false,`Неизвестный эффект заклинания: ${spell?.type}`);
 }
}
export {baseCopy,fullCopy};
