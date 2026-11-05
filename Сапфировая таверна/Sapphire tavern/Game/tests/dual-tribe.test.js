import test from 'node:test';
import assert from 'node:assert/strict';
import {makeUnit,isTribe,canMagnetize} from '../src/cards.js';
import {newGame,upgrade} from '../src/game.js';

test('Костяной Механизм относится к нежити и механизмам',()=>{
 const u=makeUnit('u31'); assert.ok(isTribe(u,'undead')); assert.ok(isTribe(u,'mech')); assert.ok(!isTribe(u,'beast'));
 assert.ok(canMagnetize(u,makeUnit('m03'))); assert.ok(canMagnetize(u,makeUnit('u01')));
});

test('новые племена распознаются по каталогу',()=>{
 assert.ok(isTribe(makeUnit('w25'),'warlock')); assert.ok(isTribe(makeUnit('e28'),'elemental'));
 assert.ok(isTribe(makeUnit('p31'),'pirate')); assert.ok(isTribe(makeUnit('d27'),'dragon')); assert.ok(isTribe(makeUnit('n23'),'naga'));
});

test('таверна поддерживает повышение до восьмого тира новых существ',()=>{
 const s=newGame(); s.gold=100; s.upgradeCost=0;
 for(let i=0;i<7;i++){assert.equal(upgrade(s).ok,true); s.gold=100;}
 assert.equal(s.tier,8); assert.equal(upgrade(s).ok,false);
});
