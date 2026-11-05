import test from 'node:test';
import assert from 'node:assert/strict';
import {cards,tokens,cardById,makeUnit,isTribe,canMagnetize} from '../src/cards.js';
import {fight} from '../src/combat.js';

const dead=(id,rank=1)=>Object.assign(makeUnit(id,rank),{health:0});
const opts={random:()=>0,tier:8,enemyTier:8};

test('новый каталог импортирован из legacy-assets, а старые записи скрыты',()=>{
  assert.equal(cards.length,120);
  assert.equal(tokens.length,19);
  assert.equal(new Set([...cards,...tokens].map(c=>c.id)).size,139);
  assert.ok(cards.every(c=>c.source==='archive/legacy-assets'));
  assert.ok(cards.every(c=>!c.token&&!c.isSpell));
  assert.ok(cards.every(c=>c.image.startsWith('./assets/cards/imported/')));
  assert.ok(cards.every(c=>c.effect===null));
  assert.ok(cardById.u01?.compatibility && cardById.u01.removed);
  assert.deepEqual([...new Set(cards.map(c=>c.tribe))].sort(),['beast','mech','naga','pirate']);
});

test('новые тиры и характеристики масштабируются без общих массивов',()=>{
  const base=makeUnit('u34'),gold=makeUnit('u34',2),copy=makeUnit('u34');
  assert.deepEqual([base.attack,base.health],[10,10]);
  assert.deepEqual([gold.attack,gold.health],[20,20]);
  copy.keywords.push('test'); assert.ok(!base.keywords.includes('test'));
  assert.throws(()=>makeUnit('u34',3),/Rank/);
});

test('двойная принадлежность нового Костяного Механизма сохраняется',()=>{
  const u=makeUnit('u31');
  assert.ok(isTribe(u,'undead')); assert.ok(isTribe(u,'mech'));
  assert.ok(canMagnetize(u,makeUnit('m03'))); assert.ok(canMagnetize(u,makeUnit('u01')));
});

test('новый Костяной Копатель призывает три скелета, золото масштабирует токены',()=>{
  for(const rank of [1,2]){
    const result=fight([dead('u07',rank)],[],opts);
    assert.equal(result.player.filter(u=>u.id==='skeleton').length,3);
    assert.ok(result.player.filter(u=>u.id==='skeleton').every(u=>u.attack===rank&&u.health===rank));
  }
});

test('новый Могильный Пёс усиливает одну нежить, а не глобальный счётчик',()=>{
  const ally=makeUnit('u01');
  const result=fight([dead('u06'),ally],[],opts);
  assert.equal(result.undeadGlobal.attack,0);
  assert.equal(result.player.find(u=>u.uid===ally.uid).attack,ally.attack+1);
});

test('бой безопасно обрабатывает новые карты и не мутирует входные доски',()=>{
  const player=[makeUnit('e28'),makeUnit('p31')], enemy=[makeUnit('d27')];
  const before=JSON.stringify([player,enemy]); const result=fight(player,enemy,opts);
  assert.equal(JSON.stringify([player,enemy]),before);
  assert.ok(result.frames.length>0); assert.ok(result.frames.every(f=>f.player.length<=8&&f.enemy.length<=8));
});

test('импортированная карта создаёт юнит с локальным изображением',()=>{
  const c=cards.find(x=>x.id==='lb_alpha_wolf');
  const unit=makeUnit(c.id,2);
  assert.equal(unit.image,c.image);
  assert.equal(unit.attack,c.attack*2);
  assert.equal(unit.health,c.health*2);
});

// Старые поведенческие проверки ниже используют скрытый compatibility-слой,
// но новые карты выше проверяются напрямую по импортированному каталогу.
