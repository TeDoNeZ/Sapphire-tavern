import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,buySpell,castSpell} from '../src/game.js';
import {makeUnit} from '../src/cards.js';

test('лавка заклинаний покупает карту по её цене',()=>{
 const s=newGame();assert.ok(s.spellShop.length>0);const spell=s.spellShop[0];s.gold=spell.cost;assert.equal(buySpell(s,0).ok,true);assert.equal(s.hand.at(-1).kind,'spell');assert.equal(s.gold,0);
});
test('целевое заклинание применяет бафф и исчезает из руки',()=>{
 const s=newGame();s.board=[makeUnit('u01')];s.hand.push({...s.spellShop[0],type:'buff',target:'single',atk:2,hp:1,cost:1});const before=s.board[0].attack;s.gold=0;const r=castSpell(s,s.hand.length-1,s.board[0].uid);assert.equal(r.ok,true);assert.equal(s.hand.length,0);assert.equal(s.board[0].attack,before+2);
});
test('поглощение без второй цели не расходует заклинание',()=>{
 const s=newGame();s.board=[makeUnit('u01')];s.hand.push({kind:'spell',id:'s5_absorb',name:'Поглощение',type:'absorb',target:'single'});const r=castSpell(s,0,s.board[0].uid);assert.equal(r.ok,false);assert.equal(s.hand.length,1);
});
test('копирование третьего существа собирает его в триплет',()=>{
 const s=newGame();
 s.board=[makeUnit('u01'),makeUnit('u01')];
 s.hand.push({kind:'spell',id:'s4_double',name:'Двойник',type:'double',target:'single'});
 const r=castSpell(s,0,s.board[0].uid);
 assert.equal(r.ok,true);
 const golden=s.board.concat(s.hand).filter(u=>u.id==='u01');
 assert.equal(golden.length,1);
 assert.equal(golden[0].rank,2);
});
