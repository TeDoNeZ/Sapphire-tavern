import test from 'node:test';
import assert from 'node:assert/strict';
import {makeUnit,isTribe} from '../src/cards.js';
import {fight} from '../src/combat.js';
import {newGame,play,nextRound} from '../src/game.js';

const dead=id=>Object.assign(makeUnit(id),{health:0});
const options={random:()=>0,tier:8};

test('Костяной Писец глобально усиливает всю нежить при найме',()=>{
 const s=newGame(); const a=makeUnit('u01'), b=makeUnit('u02'), scriber=makeUnit('u05');
 s.board=[a,b]; s.hand=[scriber]; assert.equal(play(s,0).ok,true);
 assert.equal(a.attack,2); assert.equal(b.attack,3); assert.equal(s.board.at(-1).name,'Костяной Писец');
});

test('Могильный Пёс даёт случайной нежити постоянную атаку',()=>{
 const ally=makeUnit('u01'); const result=fight([dead('u06'),ally],[],options);
 const body=result.player.find(u=>u.uid===ally.uid); assert.equal(body.attack,ally.attack+1);
 assert.deepEqual(result.undeadGlobal,{attack:0,health:0}); assert.deepEqual(result.permanent,[{uid:ally.uid,attack:1,health:0}]);
});

test('Гниющий Труп призывает скелета из нового списка токенов',()=>{
 const result=fight([dead('u02')],[],options); assert.deepEqual(result.player.map(u=>u.id),['skeleton']);
});

test('новые племена не ошибаются в бою и прогресс сохраняется после раунда',()=>{
 const s=newGame(); s.board=[makeUnit('w25'),makeUnit('e28'),makeUnit('p31')];
 const result=fight(s.board,[],options); const before=s.board.map(u=>u.uid); nextRound(s,result);
 assert.deepEqual(s.board.map(u=>u.uid),before); assert.ok(s.round>1); assert.ok(s.board.every(u=>isTribe(u,u.tribe)));
});
