import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournal,inspectState} from '../src/journal.js';
import {newGame,buy,play,reorder,nextRound} from '../src/game.js';
import {fight} from '../src/combat.js';
import {makeUnit} from '../src/cards.js';
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};

test('журнал делает независимые снимки и переживает перезагрузку',()=>{
 const storage=memory(),j=createJournal(storage),s=newGame();
 const n=j.record('До',{state:s});s.gold=99;j.record('После',{operation:n,state:s});
 const report=createJournal(storage).report();assert.equal(report.entries[0].state.gold,3);assert.equal(report.entries[1].state.gold,99);
 report.entries[0].state.gold=-1;assert.equal(j.report().entries[0].state.gold,3);
});
test('журнал записывает стек ошибки и не роняет игру при отказе хранилища',()=>{
 const j=createJournal({getItem(){throw Error('Нет доступа');},setItem(){throw Error('Квота');}});
 assert.doesNotThrow(()=>j.record('Ошибка',{error:Error('Проблема')}));
 const r=j.report();assert.match(r.storageError,/Квота/);assert.equal(r.entries[0].error.message,'Проблема');assert.match(r.entries[0].error.stack,/Проблема/);
 assert.match(createJournal().report().storageError,/недоступно/);
});
test('старые записи удаляются по лимиту, номера сохраняются, очистка не меняет игру',()=>{
 const j=createJournal(memory(),{maxBytes:1000}),s=newGame(),before=JSON.stringify(s);
 for(let i=0;i<20;i++)j.record('Событие',{text:'x'.repeat(100)});
 assert.ok(j.report().dropped>0);assert.equal(j.report().entries.at(-1).number,20);
 j.clear();assert.equal(j.report().entries.length,1);assert.equal(JSON.stringify(s),before);
});
test('пакет шагов боя сохраняется после flush',()=>{
 const storage=memory(),j=createJournal(storage);j.record('Шаг',{index:0},false);j.record('Шаг',{index:1},false);j.flush();
 assert.equal(createJournal(storage).report().entries.length,2);
});
test('проверки состояния находят дубликаты и неверные характеристики',()=>{
 const s=newGame();assert.deepEqual(inspectState(s),[]);const u=makeUnit('u01');s.board=[u,u];s.gold=-1;u.attack=NaN;
 assert.ok(inspectState(s).some(x=>x.includes('Повтор UID')));assert.ok(inspectState(s).some(x=>x.includes('золото')));assert.ok(inspectState(s).some(x=>x.includes('attack')));
});
test('действия и полный бой можно сохранить без изменения игрового состояния',()=>{
 const s=newGame(),j=createJournal(memory());buy(s,0);play(s,0);s.board.push(makeUnit('m03'));reorder(s,0,1);
 const before=JSON.stringify(s);j.record('До боя',{state:s});const result=fight(s.board,[makeUnit('u01')]);
 result.frames.forEach((frame,index)=>j.record('Шаг боя',{index,frame},false));j.flush();assert.equal(JSON.stringify(s),before);
 nextRound(s,result);j.record('После боя',{state:s});assert.deepEqual(inspectState(s),[]);assert.ok(j.report().entries.length>2);
});
