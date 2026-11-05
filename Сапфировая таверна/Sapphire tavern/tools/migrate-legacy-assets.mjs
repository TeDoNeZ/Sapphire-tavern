import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'HS v2');
const source = path.resolve(root, '..', 'archive', 'legacy-assets');
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const all = readJson(path.join(source, 'all.json')).cards;
const oldPath = path.join(root, 'Существа.json');
const old = readJson(oldPath);
const archiveDir = path.join(root, 'archive', 'legacy-cards');
fs.mkdirSync(archiveDir, { recursive: true });
if (!fs.existsSync(path.join(archiveDir, 'Существа.json'))) fs.copyFileSync(oldPath, path.join(archiveDir, 'Существа.json'));
if (!fs.existsSync(path.join(archiveDir, 'cards.js'))) fs.copyFileSync(path.join(root, 'src', 'cards.js'), path.join(archiveDir, 'cards.js'));

const detailByFile = new Map();
for (const tribe of ['beasts', 'pirats']) {
  const data = readJson(path.join(source, tribe, 'main.json'));
  for (const [tier, entries] of Object.entries(data.tiers || {})) {
    for (const c of entries || []) {
      const key = c.file || `${tribe}/__missing_${encodeURIComponent(c.name_ru || c.name || 'card')}.png`;
      detailByFile.set(key, { ...c, file: key, tier: Number(tier), missingImage: !c.file });
    }
  }
  for (const c of data.unplaced || []) {
    const key = c.file || `${tribe}/__missing_${encodeURIComponent(c.name_ru || c.name || 'card')}.png`;
    detailByFile.set(key, { ...c, file: key, tier: Number(c.tier || 1), missingImage: !c.file });
  }
}
const tribeForDir = { beasts: 'beast', mech: 'mech', nagas: 'naga', pirats: 'pirate' };
const prefixForDir = { beasts: 'lb', mech: 'lm', nagas: 'ln', pirats: 'lp' };
const normalized = [];
for (const raw of all) {
  if (!['beast', 'mech', 'naga', 'pirate'].includes(raw.type)) continue;
  const dir = raw.file.split('/')[0];
  const key = `${dir}/${raw.file.split('/').slice(1).join('/')}`;
  const detail = detailByFile.get(key);
  const base = path.basename(raw.file, path.extname(raw.file));
  const id = `${prefixForDir[dir]}_${base}`.replace(/[^a-zA-Z0-9_]/g, '_');
  const missingData = !detail;
  const image = `./assets/cards/imported/${raw.file}`;
  normalized.push({
    id, name: detail?.name || raw.name_ru, tribe: tribeForDir[dir],
    tier: Number(detail?.tier || raw.tier || 1), attack: Number(detail?.attack ?? 1), health: Number(detail?.health ?? 1),
    text: detail?.text || 'Новые данные карты требуют уточнения.', keywords: detail?.keywords || [], effect: null,
    image, source: 'archive/legacy-assets', ...(missingData ? { missingData: true } : {}),
  });
}
for (const [key, detail] of detailByFile) {
  if (!detail.missingImage) continue;
  const dir = key.split('/')[0], base = path.basename(key, '.png');
  normalized.push({ id: `${prefixForDir[dir]}_${base}`.replace(/[^a-zA-Z0-9_]/g, '_'), name: detail.name || detail.name_ru, tribe: tribeForDir[dir], tier: Number(detail.tier || 1), attack: Number(detail.attack ?? 1), health: Number(detail.health ?? 1), text: detail.text || 'Изображение не найдено: проблема исходного набора.', keywords: detail.keywords || [], effect: null, image: `./assets/cards/imported/${key}`, source: 'archive/legacy-assets', missingImage: true });
}
fs.writeFileSync(oldPath, JSON.stringify({ cards: normalized }, null, 2) + '\n', 'utf8');

for (const dir of ['beasts', 'mech', 'nagas', 'pirats']) {
  const src = path.join(source, dir), dst = path.join(root, 'assets', 'cards', 'imported', dir);
  fs.mkdirSync(dst, { recursive: true });
  for (const file of fs.readdirSync(src)) if (file.toLowerCase().endsWith('.png')) fs.copyFileSync(path.join(src, file), path.join(dst, file));
}

const cardsJs = fs.readFileSync(path.join(root, 'src', 'cards.js'), 'utf8');
const tokenStart = cardsJs.indexOf('export const tokens = [');
if (tokenStart < 0) throw new Error('tokens export not found');
const tail = cardsJs.slice(tokenStart);
const header = `// Автоматически импортировано из archive/legacy-assets. Старый каталог: archive/legacy-cards/Существа.json\nexport const cards = ${JSON.stringify(normalized, null, 2)};\n\n`;
fs.writeFileSync(path.join(root, 'src', 'cards.js'), header + tail, 'utf8');
console.log(`Imported ${normalized.length} cards; missingData=${normalized.filter(c=>c.missingData).length}`);
console.log('Missing source images:', normalized.filter(c => !fs.existsSync(path.join(root, c.image.replace('./','')))).map(c=>c.id).join(', ') || 'none');
console.log('Missing referenced images intentionally retained:', normalized.filter(c => c.image && !fs.existsSync(path.join(root, c.image.replace('./','')))).length);
