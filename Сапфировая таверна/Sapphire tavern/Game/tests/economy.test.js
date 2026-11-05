import test from 'node:test';
import assert from 'node:assert/strict';
import {makeUnit} from '../src/cards.js';
import {newGame,buy,play,sell,reroll,freeze,upgrade,reorder,nextRound,makeEnemy,ARCHETYPES} from '../src/game.js';

test('ошибочные операции не меняют состояние',()=>{
 const s=newGame(); for(const run of [()=>buy(s,99),()=>sell(s,'missing'),()=>play(s,0),()=>reorder(s,.5,0)]){
  const before=JSON.stringify(s); assert.equal(run().ok,false); assert.equal(JSON.stringify(s),before);
 }
});

test('экономика работает с существами новых племён',()=>{
 const s=newGame(); s.shop=[makeUnit('w01')]; assert.equal(buy(s,0).ok,true); assert.equal(play(s,0).ok,true);
 const id=s.board[0].uid; assert.equal(sell(s,id).ok,true); assert.equal(s.gold,1); assert.equal(reroll(s).ok,true);
 freeze(s); const old=s.shop.map(u=>u.uid); nextRound(s,{winner:'draw'}); assert.deepEqual(s.shop.map(u=>u.uid),old);
});

test('магазин не предлагает заклинания как существа и враг подбирает новые тиры',()=>{
 const s=newGame(); s.tier=8; s.shop=[]; s.gold=100; nextRound(s);
 assert.ok(s.shop.every(c=>!c.isSpell&&!c.token));
 const enemy=makeEnemy(s); assert.ok(enemy.length>0); assert.ok(enemy.every(c=>c.tier<=8));
});

test('улучшение и расстановка поддерживают восьмое место',()=>{
 const s=newGame(); s.board=Array.from({length:7},(_,i)=>makeUnit(['w01','e01','p01','d01','n01','u01','m03'][i]));
 const extra=makeUnit('b01'); s.hand=[extra]; assert.equal(play(s,0).ok,true); assert.equal(s.board.length,8);
 assert.equal(reorder(s,0,7).ok,true); assert.equal(s.board.length,8);
});

test('новый матч получает ровно четыре случайных архетипа',()=>{
  const a=newGame(),b=newGame(); assert.equal(a.archetypes.length,4); assert.equal(new Set(a.archetypes).size,4); assert.ok(a.archetypes.every(x=>ARCHETYPES.includes(x))); assert.equal(b.archetypes.length,4);
});

test('руны растут каждый раунд, а улучшение дешевеет',()=>{
  const s=newGame(); const before=s.upgradeCost; nextRound(s,{winner:'draw'}); assert.equal(s.runes,1); assert.equal(s.upgradeCost,before-1);
});

test('администратор получает бесконечные золото и здоровье',()=>{
  const s=newGame(); s.admin={infiniteGold:true,infiniteHealth:true}; s.gold=0; s.health=1; assert.equal(reroll(s).ok,true); assert.equal(upgrade(s).ok,true); assert.equal(buy(s,0).ok,true); nextRound(s,{winner:'enemy',damage:999}); assert.equal(s.health,1); assert.equal(s.gold,999);
});
