import { cards, makeUnit, cardById , isTribe, canMagnetize} from './cards.js';

const copy = value => JSON.parse(JSON.stringify(value));
const rankOf = unit => [1, 2, 4].includes(unit.rank) ? unit.rank : 1;
const has = (unit, keyword) => (unit.keywords || []).includes(keyword) || (unit.gifts || []).some(g => g.type === keyword);

/** Pure combat simulation. Gifts contain already-scaled numbers. No shop battlecries run here. */
export function fight(playerBoard, enemyBoard, options = {}) {
  const random = options.random || Math.random;
  const choose = list => list.length ? list[Math.min(list.length - 1, Math.max(0, Math.floor(random() * list.length)))] : undefined;
  const boards = [copy(playerBoard).slice(0, 8), copy(enemyBoard).slice(0, 8)];
  boards.forEach(board => board.forEach(u => {
    u.rank = rankOf(u); u.keywords ||= []; u.gifts ||= []; u.maxHealth ??= u.health;
  }));
  const originals = [new Set(boards[0].map(u => u.uid)), new Set(boards[1].map(u => u.uid))];
  const permanent = [new Map(), new Map()], rewards = [[], []];
  const undeadGlobal = [{attack:0,health:0},{attack:0,health:0}];
  const beetles = [copy(options.beetle || {}), copy(options.enemyBeetle || {})].map(b => ({attack:b.attack || 0, health:b.health || 0, gifts:b.gifts || []}));
  const beetleDelta = [{attack:0, health:0}, {attack:0, health:0}];
  const tiers = [options.tier || 1, options.enemyTier || options.tier || 1];
  const frames = [], log = [], counters = new Map(), uses = new Map();
  const cursors = [0, 0];
  const maxAttacks = Math.max(1, Math.min(300, options.maxAttacks || 300));
  const maxTriggers = Math.max(1, Math.min(2000, options.maxTriggers || 2000));
  let attacks = 0, triggers = 0, limited = false;
  const living = side => boards[side].filter(u => u.health > 0);
  const event = (message, extra = {}) => {
    if (log.length < 2000) log.push(message);
    if (frames.length < 499) frames.push({player:copy(boards[0]), enemy:copy(boards[1]), message, ...extra});
  };
  const tick = () => { if (++triggers > maxTriggers) {limited = true; return false;} return true; };
  const permanentBuff = (side, u, attack, health) => {
    if (!originals[side].has(u.uid)) return;
    const delta = permanent[side].get(u.uid) || {uid:u.uid, attack:0, health:0};
    delta.attack += attack; delta.health += health; permanent[side].set(u.uid, delta);
  };
  const grantPermanentKeyword = (side, unit, keyword) => {
    if (!unit || has(unit,keyword)) return;
    unit.keywords.push(keyword);
    if (originals[side].has(unit.uid)) {
      const delta=permanent[side].get(unit.uid)||{uid:unit.uid,attack:0,health:0};
      delta.keywords=[...new Set([...(delta.keywords||[]),keyword])];
      permanent[side].set(unit.uid,delta);
    }
    event(`${unit.name}: получает Перерождение навсегда`);
  };
  const buff = (side, u, attack, health, forever = false) => {
    if (!u || u.health <= 0) return;
    u.attack += attack; u.health += health; u.maxHealth += health;
    if (forever) permanentBuff(side, u, attack, health);
  };
  const undeadBuff = (side, attack, health, forever=true) => living(side).filter(u => isTribe(u,'undead')).forEach(u => buff(side,u,attack,health,forever));
  const undeadGlobalBuff = (side, attack, health) => {undeadGlobal[side].attack+=attack;undeadGlobal[side].health+=health;living(side).filter(u=>isTribe(u,'undead')).forEach(u=>buff(side,u,attack,health,false));};
  const randomCard = (side, tribe, predicate = () => true) => choose(cards.filter(c => isTribe(c,tribe) && c.tier <= tiers[side] && !c.disabled && !c.token && !c.isSpell && predicate(c)));
  const reward = (side, tribe, count, predicate) => {
    for (let i=0; i<count; i++) {const c=randomCard(side,tribe,predicate); if(c) rewards[side].push(c.id);}
  };
  const shoot = (side, amount, source, count = 1) => {
    for(let i=0; i<count && !limited; i++) {
      const target=choose(living(1-side)); if(!target || !tick()) return;
      target.health-=amount;
      event(`${source.name}: выстрел на ${amount}`, {attackerUid:source.uid,targetUid:target.uid});
    }
  };

  function summon(side, unit, position = boards[side].length, applyBeetle = true) {
    if (boards[side].length >= 8 || limited || !tick()) return null;
    if (isTribe(unit,'undead') && applyBeetle) {
      const initial=[options.undeadGlobal,options.enemyUndeadGlobal][side]||{};
      const a=(initial.attack||0)+undeadGlobal[side].attack,h=(initial.health||0)+undeadGlobal[side].health;
      unit.attack+=a;unit.health+=h;unit.maxHealth+=h;
    }
    if (unit.id === 'beetle' && applyBeetle) {
      unit.attack += beetles[side].attack; unit.health += beetles[side].health; unit.maxHealth += beetles[side].health;
      unit.gifts.push(...copy(beetles[side].gifts));
    }
    const listeners = living(side);
    const index = Math.max(0,Math.min(position,boards[side].length));
    if(index<cursors[side]) cursors[side]++;
    boards[side].splice(index,0,unit);
    if(unit.tribe==='beast') for(const observer of listeners) {
      if (!tick()) break;
      const r=rankOf(observer), fx=observer.effect;
      if(fx==='b06') buff(side,unit,r,r);
      if(fx==='b14') buff(side,unit,2*r,2*r);
      if(fx==='b22') buff(side,unit,3*r,3*r);
      if(fx==='b17') living(side).forEach(u=>buff(side,u,2*r,r));
      if(fx==='b18' && (uses.get(observer.uid)||0)<2*r) {
        uses.set(observer.uid,(uses.get(observer.uid)||0)+1);
        buff(side,unit,2*r,2*r);
        if(!has(unit,'reborn')) unit.keywords.push('reborn');
      }
    }
    event(`Призыв: ${unit.name}`);
    return unit;
  }
  function token(side,id,attack,health,position,keywords=[]) {
    const u=makeUnit(id); u.attack=attack; u.health=health; u.maxHealth=health;
    u.keywords=[...new Set([...u.keywords,...keywords])];
    return summon(side,u,position);
  }

  // Remove every simultaneously lethal unit before resolving any death effect.
  function settle() {
    while (!limited) {
      const batch=[];
      for(let side=0;side<2;side++) {
        for(let i=0;i<boards[side].length;i++) {
          const u=boards[side][i]; if(u.health<=0) batch.push({side,u,index:i});
        }
      }
      if(!batch.length) return;
      for(let side=0;side<2;side++) {
        for(let i=boards[side].length-1;i>=0;i--) if(boards[side][i].health<=0) {
          boards[side].splice(i,1); if(i<cursors[side]) cursors[side]--;
        }
      }
      for(const death of batch) {
        if(!tick()) break;
        const {side,u,index}=death, r=rankOf(u), reborn=has(u,'reborn');
        event(`Погибает: ${u.name}`);
        // Global death observers see deaths on either side; Avenge only allied deaths.
        for(let s=0;s<2;s++) for(const observer of living(s)) {
          const n=rankOf(observer);
          if(observer.effect==='u14' && reborn) undeadBuff(s,n,n,false);
          if(observer.effect==='u11'){observer.deathCounter=(observer.deathCounter||0)+1;buff(s,observer,2*n,n,true);}
          if(observer.effect==='u18'){observer.tempAttack=(observer.tempAttack||0)+4*n;observer.attack+=4*n;}
          if(observer.effect==='u24' && side===s){observer.tempHealth=(observer.tempHealth||0)+5*n;observer.health+=5*n;observer.maxHealth+=5*n;}
        }
        let copies=1;
        for(const observer of living(side)) {
          const n=rankOf(observer);
          if(observer.effect==='u29' && reborn && isTribe(u,'undead') && (uses.get(observer.uid)||0)<n) {
            uses.set(observer.uid,(uses.get(observer.uid)||0)+1); copies++;
          }
          const threshold={u09:2,u13:3,u20:5,u22:4,u25:5,u26:4,u27:5,m21:3,b16:1}[observer.effect];
          if(!threshold) continue;
          const count=(counters.get(observer.uid)||0)+1;
          counters.set(observer.uid,count%threshold);
          if(count<threshold || !tick()) continue;
          switch(observer.effect) {
            case 'u09': buff(side,choose(living(side).filter(x=>isTribe(x,'undead'))),n,n,true); break;
            case 'u13': token(side,'skeleton',n,n,index); break;
            case 'u20': undeadGlobalBuff(side,n,n); event(`${observer.name}: Месть (5), +${n}/+${n} нежити`); break;
             case 'u25': {const t=choose(living(side).filter(x=>x.uid!==observer.uid));if(t&&!has(t,'reborn'))t.keywords.push('reborn');break;}
             case 'u27': rewards[side].push('s_destroy_undead'); break;
            case 'u22': reward(side,'undead',n); break;
            case 'u26': {const t=makeUnit('u11',n);const count=observer.deathCounter||0;t.deathCounter=count;t.attack+=2*count;t.health+=count;t.maxHealth+=count;if(summon(side,t,index)){} break;}
            case 'm21': shoot(side,5,observer,n); break;
            case 'b16':
              beetles[side].attack+=n; beetles[side].health+=n;
              beetleDelta[side].attack+=n; beetleDelta[side].health+=n;
              living(side).filter(x=>x.id==='beetle').forEach(x=>buff(side,x,n,n)); break;
          }
        }
        let offset=0;
        const spawn=(id,a,h,count=1,keywords=[])=>{
          for(let i=0;i<count && !limited;i++) if(token(side,id,a,h,index+offset,keywords)) offset++;
        };
        switch(u.effect) {
          case 'u01': spawn('skeleton',r,r); break;
           case 'u02': {const t=makeUnit('skeleton');if(summon(side,t,index+offset))offset++;break;}
           case 'u07': spawn('skeleton',r,r,3); break;
           case 'u12': {for(let i=0;i<r;i++){const t=choose(living(side).filter(x=>isTribe(x,'undead')&&!has(x,'reborn')));if(t)grantPermanentKeyword(side,t,'reborn');}break;}
          case 'u06': {const t=choose(living(side).filter(x=>isTribe(x,'undead')));if(t)buff(side,t,r,0,true);break;}
          case 'u17': for(let i=0;i<r;i++){const c=randomCard(side,'undead');if(c&&summon(side,makeUnit(c.id),index+offset))offset++;} break;
          case 'm17': reward(side,'mech',r,c=>c.keywords.includes('magnetic')); break;
          case 'b01': spawn('spider',r,r); break;
          case 'b05': case 'b11': spawn('beetle',r,r); break;
          case 'b07': spawn('spider',r,r,2); break;
          case 'b13': for(let i=0;i<r;i++){const c=randomCard(side,'beast');if(c&&summon(side,makeUnit(c.id),index+offset))offset++;} break;
          case 'b15': spawn('guard_beast',2*r,2*r); break;
          case 'b19': spawn('spider',3*r,3*r,3); break;
          case 'b20': spawn('beetle',r,r,1,['reborn']); break;
          case 'b23': spawn('pack_beast',4*r,4*r,8-boards[side].length); break;
          case 'b24': spawn('beetle',r,r,3,['taunt']); break;
        }
        for(const gift of u.gifts) if(gift.type==='death_beetle') spawn('beetle',gift.attack??1,gift.health??1,gift.amount??1);
        if(reborn) for(let i=0;i<copies;i++) {
          let fresh;
          if(cardById[u.id]) fresh=makeUnit(u.id,r);
          else fresh={...copy(u),uid:`reborn-${u.uid}-${triggers}-${i}`,attack:u.baseAttack||1,keywords:[],gifts:[]};
          fresh.health=1; fresh.maxHealth=1;
          fresh.keywords=fresh.keywords.filter(k=>k!=='reborn');
          fresh.gifts=fresh.gifts.filter(g=>g.type!=='reborn');
          // New body loses acquired buffs and gifts; native non-reborn gifts survive.
          if(summon(side,fresh,index+offset,false))offset++;
        }
      }
    }
  }

  function strike(side, attacker) {
    if(!attacker || attacker.health<=0 || !living(1-side).length || limited) return;
    if(attacks>=maxAttacks){limited=true;return;} attacks++;
    const r=rankOf(attacker);
    if(attacker.effect==='u15') buff(side,choose(living(side).filter(x=>isTribe(x,'undead'))),r,r,true);
    if(attacker.effect==='b02') buff(side,attacker,r,0);
    if(attacker.effect==='b12') token(side,'guard_beast',3*r,r,boards[side].indexOf(attacker)+1);
    if(attacker.effect==='m15') {
      // Стреляет только во врага с атакой, равной атаке стрелка.
      const candidates=living(1-side).filter(x=>x.attack===attacker.attack);
      for(let i=0;i<r && candidates.length;i++) {
        const target=choose(candidates); candidates.splice(candidates.indexOf(target),1);
        target.health-=attacker.attack;
        event(`${attacker.name}: дополнительный выстрел`,{attackerUid:attacker.uid,targetUid:target.uid});
      }
    }
    for(const gift of attacker.gifts) {
      if(gift.type==='attack_damage') shoot(side,gift.amount||0,attacker);
      if(gift.type==='attack_self_buff') buff(side,attacker,gift.attack||0,gift.health||0);
    }
    settle();
    if(attacker.health<=0 || !boards[side].includes(attacker) || limited) return;
    const opponents=living(1-side), taunts=opponents.filter(u=>has(u,'taunt'));
    const target=choose(taunts.length?taunts:opponents); if(!target)return;
    const attack=Math.max(0,attacker.attack), retaliation=Math.max(0,target.attack), targetHealth=target.maxHealth;
    target.health-=attack; attacker.health-=retaliation;
    event(`${attacker.name} атакует ${target.name}`,{attackerUid:attacker.uid,targetUid:target.uid});
    settle();
    if(attacker.effect==='u30' && attacker.health>0 && !boards[1-side].includes(target)){attacker.health+=targetHealth;attacker.maxHealth+=targetHealth;attacker.tempHealth=(attacker.tempHealth||0)+targetHealth;}
  }

  for(let s=0;s<2;s++) for(const u of [...living(s)]) if(u.effect==='u28'){
    const at=boards[s].indexOf(u), victims=[]; if(at<=0 || !boards[s].includes(u))continue; if(at>0)victims.push(boards[s][at-1]); if(rankOf(u)>=2&&at+1<boards[s].length)victims.push(boards[s][at+1]);
    for(const v of victims){u.keywords=[...new Set([...u.keywords,...v.keywords])];u.gifts.push(...copy(v.gifts));u.attack+=v.attack;u.health+=v.health;u.maxHealth+=v.health;const i=boards[s].indexOf(v);if(i>=0)boards[s].splice(i,1);}
  }
  event('Начало боя'); settle();
  // More creatures attack first; a tied board uses the supplied RNG.
  let side=boards[0].length===boards[1].length?(random()<0.5?0:1):(boards[0].length>boards[1].length?0:1);
  const starters=[...boards[side].map(u=>({side,u})),...boards[1-side].map(u=>({side:1-side,u}))];
  for(const start of starters) if(start.u.effect==='m05' && start.u.health>0 && !limited) {
    shoot(start.side,5,start.u,rankOf(start.u)); settle();
  }
  let idle=0;
  while(living(0).length && living(1).length && !limited) {
    const board=boards[side];
    if(!board.some(u=>u.attack>0)) {if(++idle>=2){limited=true;break;}side=1-side;continue;}
    idle=0;
    let attacker;
    for(let i=0;i<board.length;i++) {
      cursors[side]%=board.length; const candidate=board[cursors[side]++];
      if(candidate.attack>0){attacker=candidate;break;}
    }
    if(attacker) {
      const times=has(attacker,'windfury')?2:1;
      for(let i=0;i<times && attacker.health>0 && boards[side].includes(attacker) && !limited;i++) strike(side,attacker);
    }
    side=1-side;
  }
  const winner=limited?'draw':boards[0].length?(boards[1].length?'draw':'player'):boards[1].length?'enemy':'draw';
  const winnerSide=winner==='player'?0:1;
  const damage=winner==='draw'?0:tiers[winnerSide]+boards[winnerSide].reduce((sum,u)=>sum+(u.tier||1),0);
  const message=limited?'Ничья: достигнут безопасный лимит боя.':winner==='draw'?'Ничья.':winner==='player'?'Победа!':'Поражение.';
  log.push(message);
  frames.push({player:copy(boards[0]),enemy:copy(boards[1]),message});
  return {winner,frames,log,permanent:[...permanent[0].values()],rewards:rewards[0],enemyPermanent:[...permanent[1].values()],enemyRewards:rewards[1],beetleDelta:beetleDelta[0],enemyBeetleDelta:beetleDelta[1],beetle:beetles[0],undeadGlobal:undeadGlobal[0],enemyUndeadGlobal:undeadGlobal[1],damage,attacks,triggers,limited,player:copy(boards[0]),enemy:copy(boards[1])};
}
