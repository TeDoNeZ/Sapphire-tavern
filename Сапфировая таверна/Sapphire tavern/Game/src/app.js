import {createJournal, inspectState} from './journal.js';
const BUILD='diagnostics-2026-04-formation-1';
let journalStorage;
try { journalStorage=localStorage; } catch {}
const journal=createJournal(journalStorage);
window.addEventListener('error',e=>journal.record('Ошибка JavaScript',{error:e.error||e.message,file:e.filename,line:e.lineno,column:e.colno}));
window.addEventListener('unhandledrejection',e=>journal.record('Ошибка асинхронной операции',{error:e.reason}));
import {cards, cardById, isTribe, canMagnetize} from './cards.js';
import {spellById, SPELL_TABLE} from './spells.js';
import {newGame, buy, buySpell, play, castSpell, sell, reroll, upgrade, freeze, reorder, nextRound, makeEnemy, discover} from './game.js';
import {fight} from './combat.js';

const $ = s => document.querySelector(s);
const SAVE = 'sapphire-tavern-v1';
const tribes = {undead:'Нежить',mech:'Механизм',beast:'Зверь',warlock:'Чернокнижник',elemental:'Элементаль',pirate:'Пират',dragon:'Дракон',naga:'Нага',spell:'Заклинание'};
const words = {reborn:'Перерождение',taunt:'Провокация',windfury:'Неистовые ветра',magnetic:'Магнетизм'};
// Надёжная загрузка сохранения: любые отсутствующие или повреждённые поля
// заменяются значениями новой игры, чтобы render() не падал на старом/битом сейве.
function loadState() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE));
    const s = data?.state;
    if (data?.version !== 1 || !s || typeof s !== 'object') return newGame();
    const fresh = newGame();
    const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const arr = (v, d) => (Array.isArray(v) ? v : d);
    return {
      ...fresh,
      round: num(s.round, fresh.round),
      runes: num(s.runes, 0),
      archetypes: Array.isArray(s.archetypes)&&s.archetypes.length===4 ? s.archetypes : fresh.archetypes,
      admin: {infiniteGold:!!s.admin?.infiniteGold,infiniteHealth:!!s.admin?.infiniteHealth},
      gold: num(s.gold, fresh.gold),
      tier: num(s.tier, fresh.tier),
      health: num(s.health, fresh.health),
      wins: num(s.wins, fresh.wins),
      defeats: num(s.defeats, 0),
      upgradeCost: num(s.upgradeCost, fresh.upgradeCost),
      frozen: typeof s.frozen === 'boolean' ? s.frozen : false,
      board: arr(s.board, []),
      hand: arr(s.hand, []),
      shop: arr(s.shop, []),
      discover: arr(s.discover, []),
      discoverQueue: arr(s.discoverQueue, []),
      maxGoldBonus: num(s.maxGoldBonus, 0),
      deferredGold: num(s.deferredGold, 0),
      beetle: {
        attack: num(s.beetle?.attack, 0),
        health: num(s.beetle?.health, 0),
        gifts: arr(s.beetle?.gifts, []),
      },
    };
  } catch(error) {
    journal.record('Ошибка загрузки сохранения',{error});
    return newGame();
  }
}
let state = loadState();
journal.record('Открытие игры',{build:BUILD,userAgent:navigator.userAgent,state,issues:inspectState(state)});
let selected=null, fighting=false, speed=1, skip=false, battleGeneration=0, frame=null, bot=null;
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function save() { try { localStorage.setItem(SAVE,JSON.stringify({version:1,state})); } catch(error) { journal.record('Ошибка сохранения',{error,state});message('Не удалось сохранить: хранилище браузера недоступно.'); } }
function message(text) { $('#message').textContent=text || ''; }
function cardHTML(u,zone,index) {
  const def=cardById[u.id]||u;
  const rank=u.rank||1, isSpell=u.kind==='spell';
  const keywords=u.keywords||[];
  const active=selected?.zone===zone && selected?.uid===u.uid;
  const art=isSpell?`./assets/spells/${u.id}.svg`:(def.image||`./assets/cards/${u.id}.svg`);
  const targetIcon=isSpell?`<span class="spell-target-icon"><img src="./assets/spells/spell_target_${u.target}.svg" alt="${u.target==='single'?'Одиночная цель':u.target==='all'?'Массовая цель':'Глобальный эффект'}"></span>`:'';
  const stats=isSpell?`<b class="spell-cost">${u.cost} ◉</b>`:`<b class="attack">${u.attack}</b><b class="hp">${u.health}</b>`;
  const badges=keywords.filter(k=>['taunt','reborn','windfury'].includes(k)).map(k=>`<span class="keyword-badge badge-${k}" title="${words[k]||k}">${k==='taunt'?'🛡':k==='reborn'?'♻':'⚡'} ${words[k]||k}</span>`).join('');
  return `<button type="button" class="card ${isSpell?'spell-card':''} ${rank===2?'golden':rank===4?'sapphire':''} ${keywords.includes('taunt')?'taunt':''} ${keywords.includes('reborn')?'reborn':''} ${keywords.includes('windfury')?'windfury':''} ${active?'selected':''}" data-zone="${zone}" data-index="${index}" data-uid="${esc(u.uid)}" aria-label="${esc(u.name)}, ${esc(def.text||'')}">${targetIcon}<span class="card-tier">${isSpell?'✦':`<img src="./assets/tiers/tier_${u.tier||1}.svg" alt="Тир ${u.tier||1}">`}</span><span class="card-art"><img src="${art}" alt="" draggable="false"></span>${badges?`<span class="keyword-badges">${badges}</span>`:''}<span class="card-rank">${isSpell?'ЗАКЛИНАНИЕ':rank===4?'САПФИР':rank===2?'ЗОЛОТО':''}</span><span class="card-name">${esc(u.name)}</span><span class="card-tribe">${isSpell?'Магия':(u.tribes||cardById[u.id]?.tribes||[u.tribe]).map(t=>tribes[t]).filter(Boolean).join(' / ')||'Существо'}</span><span class="card-text">${esc(def.text||'')}</span><span class="card-stats">${stats}</span></button>`;
}
function fillBoard(el,units,zone) {
  el.innerHTML=units.map((u,i)=>cardHTML(u,zone,i)).join('');
}
function render() {
  $('#round').textContent=state.round;
  $('#health').textContent=state.admin?.infiniteHealth?'∞':state.health;
  $('#runes').textContent=state.runes||0;
  $('#gold').textContent=state.admin?.infiniteGold?'∞':state.gold;
  $('#tier').textContent=state.tier;
  $('#wins').textContent=state.wins;
  $('#upgrade').textContent=state.tier>=8?'Таверна VIII':`Улучшить · ${state.upgradeCost} ◉`;
  $('#upgrade').disabled=fighting||state.tier>=8||(!state.admin?.infiniteGold&&state.gold<state.upgradeCost);
  $('#refresh').disabled=fighting||(!state.admin?.infiniteGold&&state.gold<1);
  $('#freeze').disabled=fighting;
  $('#freeze').classList.toggle('active',!!state.frozen);
  $('#freeze').textContent=state.frozen?'Разморозить':'Заморозить';
  $('#battle').disabled=fighting||!!state.discover?.length;
  $('#battle').textContent=fighting?'Идёт бой…':'В бой';
  $('#phase-label').textContent=fighting?'АВТОМАТИЧЕСКИЙ БОЙ':'ФАЗА НАЙМА';
  $('#shop-area').hidden=fighting;
  $('#enemy-area').hidden=!fighting;
  $('#enemy-board').hidden=!fighting;
  $('#combat-controls').hidden=!fighting;
  $('#shop').innerHTML=[...state.shop,...(state.spellShop||[])].map((u,i)=>cardHTML(u,'shop',i)).join('');
  fillBoard($('#board'),frame?.player||state.board,'board');
  if(fighting) fillBoard($('#enemy-board'),frame?.enemy||bot||[],'enemy');
  $('#hand').innerHTML=state.hand.map((u,i)=>cardHTML(u,'hand',i)).join('') || '<p class="empty-hand">Купите существо в таверне — оно появится здесь</p>';
  $('#hand').setAttribute('aria-label',`Рука: ${state.hand.length} из 15`);
  $('#enemy-preview').textContent=`Раунд ${state.round} · случайная армия · бесконечное путешествие${state.defeats?` · возрождений ${state.defeats}`:''}`;
  renderSelection();
}
function getSelected() { if(!selected)return null; const list=selected.zone==='shop'?[...state.shop,...(state.spellShop||[])]:state[selected.zone]; return list?.find(u=>u.uid===selected.uid)||null; }
function actionButton(text,action,disabled=false) { return `<button class="action-button" data-action="${action}" ${disabled?'disabled':''}>${text}</button>`; }
function giftDescriptions(gifts=[]){
  const groups=new Map();
  for(const g of gifts){
    const key=`${g.type}|${g.attack??''}|${g.health??''}|${g.amount??''}`;
    const old=groups.get(key)||{g,n:0};old.n++;groups.set(key,old);
  }
  return [...groups.values()].map(({g,n})=>{
    const a=(g.attack??0)*n,h=(g.health??0)*n,amount=(g.amount??1)*n,m=n>1?`${n}× `:'';
    if(g.type==='turn_gold')return `${amount}× золота в начале хода`;
    if(g.type==='turn_self_buff')return `${m}+${a}/${h} себе в начале хода`;
    if(g.type==='turn_mechs_buff')return `${m}+${a}/${h} всем механизмам в начале хода`;
    if(g.type==='future_mech_buff')return `${m}+${a}/${h} следующему примагниченному механизму`;
    if(g.type==='attack_damage')return `${m}${amount} урона при атаке`;
    if(g.type==='spell_buff')return `${m}+${a}/${h} заклинаниям`;
    if(g.type==='reborn')return `${m}Перерождение`;
    return `${m}${g.type}`;
  });
}
let previewTimer=null,previewHeld=false;
function clearPreviewTimer(){if(previewTimer){clearTimeout(previewTimer);previewTimer=null;}}
function schedulePreviewHide(){clearPreviewTimer();previewTimer=setTimeout(()=>{if(!previewHeld){selected=null;render();}},5000);}
function renderCardPreview(u){
  let preview=document.querySelector('#card-preview');
  if(!u){clearPreviewTimer();preview?.remove();return;}
  if(!preview){preview=document.createElement('aside');preview.id='card-preview';document.body.append(preview);}
  const def=u.kind==='spell'?u:cardById[u.id]||u;
  const art=u.kind==='spell'?`./assets/spells/${u.id}.svg`:(def.image||`./assets/cards/${u.id}.svg`);
  const gifts=giftDescriptions(u.gifts||[]);
  const previewClass=u.kind==='spell'?'spell':'entity';
  preview.innerHTML=`<img class="card-preview-art ${previewClass}" src="${art}" alt=""><div class="card-preview-copy"><strong>${esc(u.name)}</strong><small>${u.kind==='spell'?'Заклинание':`${(u.tribes||cardById[u.id]?.tribes||[u.tribe]).map(t=>tribes[t]).filter(Boolean).join(' / ')||'Существо'} · ${u.attack}/${u.health}`}</small><p>${esc(def.text||'')}</p>${gifts.length?`<div class="card-preview-gifts"><b>Дары</b>${gifts.map(g=>`<span>${esc(g)}</span>`).join('')}</div>`:''}</div>`;
  const card=[...document.querySelectorAll('.card')].find(el=>el.dataset.zone===selected?.zone&&el.dataset.uid===selected?.uid);
  if(!card)return;
  const r=card.getBoundingClientRect(),gap=10,w=Math.min(250,window.innerWidth-20);
  const left=r.left>w+gap && r.left>window.innerWidth-r.right ? r.left-w-gap : r.right+gap;
  preview.style.width=`${w}px`;preview.style.left=`${Math.max(10,Math.min(window.innerWidth-w-10,left))}px`;preview.style.top=`${Math.max(10,Math.min(window.innerHeight-190,r.top))}px`;
  schedulePreviewHide();
}
function renderSelection() {
  const panel=$('#selection-panel');
  if(fighting) { renderCardPreview(null); panel.innerHTML='<span>Существа атакуют автоматически. Постоянные усиления сохранятся после боя.</span>'; return; }
  if(state.discover?.length) {
    renderCardPreview(null);panel.innerHTML=`<div class="discover-title">Раскопка — выберите одну карту</div><div class="discover-options">${state.discover.map((u,i)=>`<div>${cardHTML(u,'discover',i)}${actionButton('Выбрать','discover-'+i,state.hand.length>=15)}</div>`).join('')}</div>${state.hand.length>=15?'<p>Рука заполнена. Сыграйте карту или продайте существо.</p>':''}`;
    return;
  }
  const u=getSelected();
  if(!u) { selected=null; renderCardPreview(null); panel.innerHTML='<span>Коснитесь карты, чтобы узнать её свойства. Перетащите из магазина в руку, из руки на поле, с поля — в продажу.</span>'; return; }
  const text=(u.kind==='spell'?u.text:(cardById[u.id]?.text||''));
  let actions='';
  if(selected.zone==='shop') actions=actionButton(`Купить · ${u.kind==='spell'?u.cost:3} ◉`,u.kind==='spell'?'buy-spell':'buy',state.gold<(u.kind==='spell'?u.cost:3)||state.hand.length>=15);
  if(selected.zone==='board') actions=actionButton('Продать · +1 ◉','sell')+actionButton('←','left',state.board[0]?.uid===u.uid)+actionButton('→','right',state.board.at(-1)?.uid===u.uid);
  if(selected.zone==='hand') actions=u.kind==='spell'?actionButton('Разыграть заклинание','cast'):actionButton('На поле','play',state.board.length>=8)+((u.keywords||[]).includes('magnetic')?actionButton('Примагнитить','magnetic'): '');
  renderCardPreview(u);
   const propertyBadges=(u.keywords||[]).filter(k=>['taunt','reborn','windfury'].includes(k)).map(k=>`<span class="property-chip chip-${k}">${k==='taunt'?'🛡':k==='reborn'?'♻':'⚡'} ${words[k]||k}</span>`).join('');
   const meta=u.kind==='spell'?`Заклинание · стоимость ${u.cost} ◉ · цель: ${u.target||'глобальная'}`:`Тир ${u.tier||''} · ${u.attack}/${u.health} · ${(u.tribes||cardById[u.id]?.tribes||[u.tribe]).map(t=>tribes[t]).filter(Boolean).join(' / ')||'Существо'}`;
   const gifts=giftDescriptions(u.gifts||[]);
   panel.innerHTML=`<div class="selection-description"><strong>${esc(u.name)} ${u.rank>1?`×${u.rank}`:''}</strong><small class="selection-meta">${esc(meta)}</small>${propertyBadges?`<div class="selected-properties" aria-label="Свойства карты">${propertyBadges}</div>`:''}<span class="selection-text">${esc(text)}${u.rank>1?' Числовые эффекты усилены в '+u.rank+' раза.':''}</span>${(u.keywords||[]).length?`<div class="detail-section"><b>Свойства</b><span>${(u.keywords||[]).map(k=>esc(words[k]||k)).join(' · ')}</span></div>`:''}${gifts.length?`<div class="detail-section gifts"><b>Дары</b><span>${gifts.map(g=>esc(g)).join(' · ')}</span></div>`:''}</div><div class="selection-actions">${actions}</div>`;
}
const actionNames={buy:'Покупка',cast:'Розыгрыш заклинания',play:'Розыгрыш карты',sell:'Продажа',reroll:'Обновление магазина',upgrade:'Улучшение таверны',freeze:'Заморозка',reorder:'Перестановка',discover:'Раскопка'};
function act(fn,...args) {
  const action=actionNames[fn.name]||fn.name;
  if(fighting){journal.record('Действие заблокировано',{action,args,reason:'Идёт бой'});return;}
  const operation=journal.record('Начало действия',{action,args,selected,before:state});
  try {
    const result=fn(state,...args);
    journal.record('Результат действия',{operation,action,args,result,after:state,issues:inspectState(state)});
    message(result?.message||'Готово');if(result?.ok){selected=null;save();}render();return result;
  } catch(error){journal.record('Ошибка действия',{operation,action,args,error,after:state});message(`Ошибка: ${error.message}. Откройте «Логи».`);console.error(error);return {ok:false,message:error.message};}
}
const targetRules={u16:'undead',u21:'undead',m11:'mech',m22:'mech',b10:'beast'};
function playSelected(mode='play',target=null,position=null) {
  const u=getSelected(); if(!u||selected.zone!=='hand'||fighting)return;
  const index=state.hand.findIndex(v=>v.uid===u.uid);
  if(u.kind==='spell'){
    const targets=state.board;
    const executeSpell=uid=>{closeModal();act(castSpell,index,uid);};
    if(['single'].includes(u.target)&&targets.length) { showModal('Выберите цель',targets.map(t=>`<button class="target-choice" data-target="${t.uid}">${esc(t.name)} · ${t.attack}/${t.health}</button>`).join('')); $('#modal-body').onclick=e=>{const b=e.target.closest('[data-target]');if(b)executeSpell(b.dataset.target);}; }
    else executeSpell(null);
    return;
  }
  const tribe=mode==='magnetic'?'mech':targetRules[u.id];
  const targets=tribe?state.board.filter(v=>mode==='magnetic'?canMagnetize(u,v):isTribe(v,tribe)):[];
  const execute=(uid,choice='reborn')=>{ closeModal();act(play,index,uid,mode,choice,position); };
  if(tribe&&targets.length) {
    if(u.id==='b10'&&mode==='play') {
      showModal('Выберите зверя и дар',targets.map(t=>`<div class="target-choice"><strong>${esc(t.name)} · ${t.attack}/${t.health}</strong><button data-target="${t.uid}" data-gift="reborn">Перерождение</button><button data-target="${t.uid}" data-gift="windfury">Неистовые ветра</button></div>`).join(''));
    } else if(target&&targets.some(t=>t.uid===target)) { execute(target); return; }
    else showModal(mode==='magnetic'?'К кому примагнитить?':'Выберите цель',targets.map(t=>`<button class="target-choice" data-target="${t.uid}">${esc(t.name)} · ${t.attack}/${t.health}</button>`).join(''));
    $('#modal-body').onclick=e=>{const b=e.target.closest('[data-target]');if(b)execute(b.dataset.target,b.dataset.gift||'reborn');};
  } else if(mode==='magnetic') message('Нужен механизм на вашем поле.');
  else execute(null);
}
function showModal(title,html) { $('#modal-title').textContent=title; $('#modal-body').innerHTML=html;$('#modal-body').onclick=null;if(!$('#modal').open)$('#modal').showModal(); }
function closeModal() { $('#modal').close();$('#modal-body').onclick=null; }
$('#modal-close').onclick=closeModal;
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal();});
document.addEventListener('click',e=>{
  if(suppressClick){ e.preventDefault(); return; }
  const b=e.target.closest('[data-action]');
  if(b&&!fighting){
    const a=b.dataset.action,u=getSelected();
    if(a.startsWith('discover-'))act(discover,Number(a.split('-')[1]));
    else if(a==='buy'&&u)act(buy,state.shop.findIndex(v=>v.uid===u.uid));
    else if(a==='buy-spell'&&u)act(buySpell,state.spellShop.findIndex(v=>v.uid===u.uid));
    else if(a==='sell'&&u)act(sell,u.uid);
    else if(a==='play'||a==='magnetic'||a==='cast')playSelected(a);
    else if((a==='left'||a==='right')&&u){const i=state.board.findIndex(v=>v.uid===u.uid);act(reorder,i,i+(a==='left'?-1:1));}
    return;
  }
  const c=e.target.closest('.card');
  if(c&&!fighting&&c.dataset.zone!=='enemy'&&c.dataset.zone!=='discover'){
    if(selected?.zone==='hand'&&c.dataset.zone==='board'){
      const handUnit=getSelected(),targetUnit=state.board.find(v=>v.uid===c.dataset.uid);
      if(canMagnetize(handUnit,targetUnit))playSelected('magnetic',c.dataset.uid);
      else {const required=targetRules[handUnit?.id];playSelected('play',required&&targetUnit?.tribe===required?c.dataset.uid:null,Number(c.dataset.index));}
      return;
    }
    selected={zone:c.dataset.zone,uid:c.dataset.uid};render();
  } else if(e.target.closest('#board')&&selected?.zone==='hand')playSelected('play',null,state.board.length);
   else if(selected){selected=null;render();}
});
$('#admin').onclick=()=>{state.admin=state.admin||{};const enabled=!(state.admin.infiniteGold&&state.admin.infiniteHealth);state.admin.infiniteGold=enabled;state.admin.infiniteHealth=enabled;if(enabled)state.gold=999;message(enabled?'Админ-режим включён: бесконечные золото и здоровье.':'Админ-режим выключен.');save();render();};
$('#refresh').onclick=()=>act(reroll);
$('#upgrade').onclick=()=>act(upgrade);
$('#freeze').onclick=()=>act(freeze);
$('#speed').onclick=()=>{speed=speed===1?3:speed===3?6:1;$('#speed').textContent=`Скорость ×${speed}`;};
$('#skip').onclick=()=>{skip=true;};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
$('#battle').onclick=async()=>{
  if(fighting||state.discover?.length){journal.record('Бой заблокирован',{fighting,discover:state.discover});return;}
  journal.record('Начало боя',{before:state});
  fighting=true;const formation=state.board.map(u=>u.uid);selected=null;skip=false;frame=null;const generation=++battleGeneration;
  bot=makeEnemy(state);render();message('Противник найден. Начинается бой!');
  journal.record('Армии перед боем',{player:state.board,enemy:bot,options:{tier:state.tier,beetle:state.beetle,undeadGlobal:state.undeadGlobal}});
  let result;
  try { result=fight(state.board,bot,{tier:state.tier,beetle:state.beetle,undeadGlobal:state.undeadGlobal}); }
  catch(error){journal.record('Ошибка расчёта боя',{error,state,enemy:bot});fighting=false;render();message(`Не удалось рассчитать бой: ${error.message}`);console.error(error);return;}
  const {frames:combatFrames=[],...outcome}=result;
  const combat=journal.record('Результат расчёта боя',{result:outcome,frameCount:combatFrames.length});
  combatFrames.forEach((step,index)=>journal.record('Шаг боя',{combat,index,message:step.message,frame:step},false));
  journal.flush();
  for(const f of result.frames||[]){
    if(skip||generation!==battleGeneration)break;
    frame=f;render();message(f.message||'');
    if(f.attackerUid)document.querySelector(`[data-uid="${f.attackerUid}"]`)?.classList.add('attacking');
    if(f.targetUid)document.querySelector(`[data-uid="${f.targetUid}"]`)?.classList.add('hit');
    await delay(650/speed);
  }
  if(generation!==battleGeneration)return;
  journal.record('Начало нового раунда',{before:state});
  const summary=nextRound(state,result);
  const placement=new Map(formation.map((uid,index)=>[uid,index]));
  state.board.sort((a,b)=>(placement.get(a.uid)??Number.MAX_SAFE_INTEGER)-(placement.get(b.uid)??Number.MAX_SAFE_INTEGER));
  journal.record('Итог боя и восстановление расстановки',{summary,formation,after:state,issues:inspectState(state)});
  fighting=false;frame=null;bot=null;
  save();render();message(`${result.winner==='player'?'Победа!':result.winner==='enemy'?'Поражение.':'Ничья.'} ${summary?.message||'Новый раунд — таверна открыта.'}`);
};
$('#restart').onclick=()=>{
  if(fighting){message('Сначала завершите бой или нажмите «Пропустить».');return;}
  showModal('Начать заново?','<p>Текущая армия и прогресс будут потеряны.</p><button id="confirm-restart" class="action-button">Да, новая игра</button>');
  $('#confirm-restart').onclick=()=>{journal.record('Сброс игры',{before:state});state=newGame();journal.record('Новая игра',{after:state});selected=null;closeModal();save();render();message('Добро пожаловать в Сапфировую таверну!');};
};
$('#help').onclick=()=>showModal('Как играть',`<div class="help-copy"><p>Покупайте существ за <b>3 золота</b>, ставьте их из руки на поле. Продажа возвращает <b>1 золото</b>. Обновление магазина стоит <b>1</b>, заморозка бесплатна.</p><p><b>8 мест на поле · 15 в руке.</b> Перетаскивайте карты из магазина в руку или на поле для покупки, удерживая карту чуть дольше; из руки — на поле, а с поля — в таверну для продажи. Существа можно перетаскивать, чтобы менять их порядок. В бою строй временно перестраивается, после боя вернётся ваша расстановка. Магнитные карты можно поставить отдельно или примагнитить к механизму.</p><p>Три одинаковые обычные карты объединяются в <b>золотую ×2</b>. Три золотые — в <b>сапфировую ×4</b>. Слияние даёт раскопку следующего уровня таверны.</p><p>В бою существа атакуют сами. Провокация защищает остальных. Перерождение возвращает существо один раз с базовой атакой и 1 здоровьем, без накопленных усилений.</p><p>Раунды бесконечны. Бот получает случайный, постепенно усиливающийся стол. На нуле здоровья вы восстанавливаете 40 здоровья, сохраняя армию; учитывается возрождение.</p><p>Доход растёт с 3 до 10 золота; остаток не переносится. Таймера нет. Постоянные эффекты боя сохраняются, обычные повреждения и временные усиления — нет.</p><p>Прогресс автоматически сохраняется в этом браузере. Во время боя сохранена позиция перед его началом.</p><p>Это самостоятельная фанатская игра с оригинальными заглушками, не официальный продукт Blizzard.</p></div>`);
$('#collection').onclick=()=>{
  showModal('Атлас карт · 216 существ + 22 заклинания',`<div class="collection-filters"><button data-tribe="all">Все карты</button><button data-tribe="undead">Нежить</button><button data-tribe="mech">Механизмы</button><button data-tribe="beast">Звери</button><button data-tribe="spells">Заклинания</button></div><div id="atlas"></div>`);
  const draw=t=>{
    if(t==='spells'){$('#atlas').innerHTML=Object.values(SPELL_TABLE).map(c=>`<article class="atlas-entry spell-entry"><img src="./assets/spells/${c.id}.svg" alt="" loading="lazy"><div><strong>${esc(c.name)}</strong><small>Заклинание · цель: ${c.target==='single'?'одиночная':c.target==='all'?'массовая':'глобальная'} · тир ${c.tier} · ${c.cost} ◉</small><p>${esc(c.text)}</p></div></article>`).join('');return;}
    $('#atlas').innerHTML=cards.filter(c=>t==='all'||isTribe(c,t)).map(c=>`<article class="atlas-entry"><img src="${esc(c.image)}" alt="" loading="lazy"><div><strong>${esc(c.name)}</strong><small>${(c.tribes||[c.tribe]).map(t=>tribes[t]).join(' / ')} · таверна ${c.tier} · ${c.attack}/${c.health}</small><p>${esc(c.text)}</p></div></article>`).join('');
  };
  draw('all');$('#modal-body').onclick=e=>{if(e.target.dataset.tribe)draw(e.target.dataset.tribe);};
};

// Pointer Events: long press allows touch scrolling of the hand without accidental plays.
let drag=null, suppressClick=false;
document.addEventListener('pointerdown',e=>{
  const c=e.target.closest('.card');
  if(!c||fighting||!['shop','hand','board'].includes(c.dataset.zone)||e.button>0)return;
  previewHeld=!!(selected&&selected.zone===c.dataset.zone&&selected.uid===c.dataset.uid);
  if(previewHeld)clearPreviewTimer();
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,zone:c.dataset.zone,uid:c.dataset.uid,element:c,active:false,ghost:null,pointerType:e.pointerType,ready:e.pointerType==='mouse'};
  try { c.setPointerCapture?.(e.pointerId); } catch {}
  if(e.pointerType!=='mouse')drag.timer=setTimeout(()=>{if(drag){drag.ready=true;startDrag();}},360);
});
function startDrag(){if(!drag||drag.active)return;drag.active=true;drag.ghost=drag.element.cloneNode(true);drag.ghost.classList.add('drag-ghost');drag.ghost.style.width=drag.element.offsetWidth+'px';document.body.append(drag.ghost);moveGhost(drag.x,drag.y);document.body.classList.add('is-dragging');navigator.vibrate?.(15);}
function moveGhost(x,y){if(drag?.ghost){drag.ghost.style.left=x+'px';drag.ghost.style.top=y+'px';}}
document.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const d=Math.hypot(e.clientX-drag.x,e.clientY-drag.y);
  if(!drag.ready&&d>10&&drag.pointerType==='mouse'){clearTimeout(drag.timer);drag.ready=true;startDrag();}
  if(drag.ready&&d>7)startDrag();
  if(drag.active){e.preventDefault();moveGhost(e.clientX,e.clientY);}
},{passive:false});
function endDrag(e,cancel=false){
  if(!drag)return;clearTimeout(drag.timer);const d=drag;drag=null;d.ghost?.remove();document.body.classList.remove('is-dragging');
   previewHeld=false;
  if(!d.active)return;suppressClick=true;setTimeout(()=>{suppressClick=false;},200);
  if(cancel){journal.record('Перетаскивание отменено',{from:{zone:d.zone,uid:d.uid}});return;}
  const el=document.elementFromPoint(e.clientX,e.clientY);
  journal.record('Перетаскивание',{from:{zone:d.zone,uid:d.uid},to:{id:el?.closest('[id]')?.id,zone:el?.closest('[data-zone]')?.dataset.zone,uid:el?.closest('[data-uid]')?.dataset.uid,index:el?.closest('[data-index]')?.dataset.index},x:e.clientX,y:e.clientY});
  if(!el)return;
  selected={zone:d.zone,uid:d.uid};
  if(d.zone==='shop'&&(el.closest('#hand')||el.closest('#board'))){const dragged=(state.shop||[]).find(u=>u.uid===d.uid);if(dragged)act(buy,state.shop.findIndex(u=>u.uid===d.uid));else act(buySpell,state.spellShop.findIndex(u=>u.uid===d.uid));}
  else if(d.zone==='hand'&&el.closest('#board')){
    const slot=el.closest('#board [data-index]');
    const targetCard=el.closest('#board .card');
    const target=targetCard?.dataset.uid;
    const position=Number(slot?.dataset.index??state.board.length);
    const u=getSelected(),targetUnit=target?state.board.find(v=>v.uid===target):null;
     if(u?.kind==='spell'&&target){act(castSpell,state.hand.findIndex(v=>v.uid===u.uid),target);}
     else if(target&&canMagnetize(u,targetUnit))playSelected('magnetic',target);
    else {const required=targetRules[u?.id];playSelected('play',required&&targetUnit?.tribe===required?target:null,position);}
  } else if(d.zone==='board'&&el.closest('#shop'))act(sell,d.uid);
  else if(d.zone==='board'&&el.closest('#board')){
    const slot=el.closest('#board [data-index]');
    const to=Number(slot?.dataset.index??state.board.length-1);
    act(reorder,state.board.findIndex(u=>u.uid===d.uid),Math.min(to,7));
  }else render();
}
document.addEventListener('pointerup',e=>endDrag(e));
document.addEventListener('pointercancel',e=>endDrag(e,true));
// Не даём браузеру открывать контекстное меню («Сохранить картинку») при долгом нажатии на карту.
document.addEventListener('contextmenu',e=>{ if(e.target.closest('.card')||e.target.closest('.atlas-entry')||e.target.tagName==='IMG') e.preventDefault(); });
try { render(); message('Таверна открыта. Соберите армию и нажмите «В бой».'); }
catch (err) { journal.record('Ошибка первого отображения: аварийный сброс',{error:err,before:state});console.error('Ошибка первого рендера, сброс на новую игру:', err); state = newGame(); save(); render(); }

// Записываем смысл клика, но не каждое движение пальца.
document.addEventListener('click',e=>{
  const el=e.target.closest('button');if(!el||el.closest('#log-dialog'))return;
  journal.record('Нажатие',{id:el.id,action:el.dataset.action,zone:el.dataset.zone,uid:el.dataset.uid,index:el.dataset.index,target:el.dataset.target,gift:el.dataset.gift,text:el.textContent.trim().slice(0,160),selected,fighting,speed,skip});
},true);
const logDialog=document.createElement('dialog');logDialog.id='log-dialog';
logDialog.innerHTML='<div class="modal-heading"><h2>Журнал игры</h2><button id="log-close">Закрыть</button></div><p>Действия, состояния до/после и полный расчёт боя. Последние 100 записей сверху; нажмите запись для подробностей. Все сохранённые записи — в скачанном JSON. Журнал локальный, лимит около 10 МБ.</p><button id="log-download">Скачать JSON</button> <button id="log-clear">Очистить журнал</button><p id="log-status"></p><div id="log-content" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:55vh;overflow:auto"></div>';
document.body.append(logDialog);
function renderLogs(){
  const report=journal.report();
  document.querySelector('#log-status').textContent=`Записей: ${report.entries.length}. Удалено старых: ${report.dropped}. ${report.storageError?'Не удалось сохранить на устройстве: '+report.storageError:'Журнал сохраняется между перезагрузками.'}`;
  const content=document.querySelector('#log-content');content.replaceChildren();
  for(const e of report.entries.slice(-100).reverse()){
    const details=document.createElement('details'),summary=document.createElement('summary');
    summary.textContent=`#${e.number} ${e.time} · ${e.type}${e.action?' · '+e.action:''}${e.text?' · '+e.text:''}${e.message?' · '+e.message:''}${e.result?.message?' · '+e.result.message:''}${e.error?' · '+(e.error.message||JSON.stringify(e.error)):''}${e.issues?.length?' ⚠ '+e.issues.join('; '):''}`;
    details.append(summary);details.addEventListener('toggle',()=>{if(details.open&&details.children.length===1){const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';pre.textContent=JSON.stringify(e,null,2);details.append(pre);}});content.append(details);
  }
}
$('#logs').onclick=()=>{renderLogs();logDialog.showModal();};
$('#log-close').onclick=()=>logDialog.close();
$('#log-clear').onclick=()=>{if(confirm('Очистить диагностический журнал? Прогресс игры сохранится.')){journal.clear();journal.record('Состояние после очистки',{state});renderLogs();}};
$('#log-download').onclick=()=>{
  const report={...journal.report(),build:BUILD,currentState:state,interface:{selected,fighting,speed,skip,frame,enemy:bot}};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`tavern-log-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
};
