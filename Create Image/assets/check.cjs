const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'catalog.js'),'utf8'), context);
const catalog = context.window.IMAGE_CATALOG;
const listed = Object.values(catalog).flat();
function images(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => {
    const full = path.join(dir,e.name);
    return e.isDirectory() ? images(full) : /\.(png|jpe?g|webp|gif|svg)$/i.test(e.name) ? [path.relative(root,full).replaceAll('\\','/')] : [];
  });
}
const actual = images(path.join(root,'1'));
assert.deepEqual([...listed].sort(),actual.sort());
assert.equal(new Set(listed).size,listed.length);
const data = JSON.parse(fs.readFileSync(path.join(__dirname,'data.json'),'utf8'));
assert.equal(data.version,1);
for (const kind of ['minions','spells']) {
  assert(Array.isArray(data[kind]));
  for (const card of data[kind]) {
    assert(card.id && card.name);
    assert(Number.isInteger(card.tier) && card.tier>=1 && card.tier<=8);
    assert.equal(typeof card.isActive,'boolean');
    assert.equal(typeof card.isToken,'boolean');
    assert(listed.includes(card.image));
    if (kind==='minions') {
      for(const key of ['poison','taunt','windfury','reborn','stealth','divineShield']) assert.equal(typeof card.keywords[key],'boolean');
      assert.equal(typeof card.attack,'number'); assert.equal(typeof card.health,'number');
    } else assert.equal(typeof card.cost,'number');
  }
}
console.log(`PASS: catalog covers all ${listed.length} images in ${Object.keys(catalog).length} folders; JSON v1 contract valid.`);
