import {mkdir,writeFile} from 'node:fs/promises';
import {cards,tokens} from '../src/cards.js';
import {SPELL_TABLE} from '../src/spells.js';

const cardDir=new URL('../assets/cards/',import.meta.url);
const spellDir=new URL('../assets/spells/',import.meta.url);
await mkdir(cardDir,{recursive:true}); await mkdir(spellDir,{recursive:true});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const palettes={
 undead:['#11162d','#564d91','#a5f1ca'],mech:['#171b24','#a66b35','#75e6ff'],beast:['#10281e','#748c43','#f0d26c'],
 warlock:['#24112f','#8b3fb0','#e0a4ff'],elemental:['#301b10','#c05a2e','#ffd56a'],pirate:['#1d2538','#3c7197','#ffd27a'],
 dragon:['#32131c','#ad3c45','#ffcf79'],naga:['#102b39','#24819a','#9eeaff'],spell:['#241b3d','#7459bd','#e7d9ff'],spellcraft:['#241b3d','#7459bd','#e7d9ff']
};
const hash=id=>[...id].reduce((n,c)=>((n*33+c.charCodeAt(0))>>>0),7);
function art(item, kind='card'){
 const tribe=(item.tribe||'spell').split('/')[0], [bg,body,glow]=palettes[tribe]||palettes.spell, h=hash(item.id||item.name), rotation=(h%13)-6;
 const icon=h%4===0?`<path d="M160 70L207 148 280 172 207 197 160 290 113 197 40 172 113 148Z" fill="${body}" stroke="${glow}" stroke-width="8"/><circle cx="160" cy="172" r="35" fill="${glow}" opacity=".8"/>`:h%4===1?`<circle cx="160" cy="172" r="100" fill="${body}" stroke="${glow}" stroke-width="9"/><path d="M92 172H228M160 104V240" stroke="${glow}" stroke-width="15"/><circle cx="160" cy="172" r="22" fill="${bg}"/>`:h%4===2?`<path d="M160 55L247 112 230 245 160 300 90 245 73 112Z" fill="${body}" stroke="${glow}" stroke-width="9"/><path d="M105 145L160 110 215 145 160 180Z" fill="${glow}" opacity=".8"/><path d="M160 180V267" stroke="${glow}" stroke-width="10"/>`:`<path d="M65 245Q88 92 160 72Q232 92 255 245L220 290H100Z" fill="${body}" stroke="${glow}" stroke-width="9"/><circle cx="126" cy="165" r="14" fill="${glow}"/><circle cx="194" cy="165" r="14" fill="${glow}"/><path d="M120 215Q160 240 200 215" fill="none" stroke="${glow}" stroke-width="9"/>`;
 const label=kind==='spell'?'ЗАКЛИНАНИЕ':(item.token?'ТОКЕН':(item.tribe||'').toUpperCase());
 return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="640" viewBox="0 0 320 400" role="img" aria-labelledby="title desc"><title id="title">${esc(item.name||item.id)}</title><desc id="desc">${esc(item.text||'')}</desc><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="${body}"/><stop offset="1" stop-color="${bg}"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="320" height="400" rx="20" fill="url(#g)"/><circle cx="160" cy="170" r="123" fill="none" stroke="${glow}" opacity=".2" stroke-width="3"/><g transform="rotate(${rotation} 160 180)" filter="url(#glow)">${icon}</g><rect x="18" y="316" width="284" height="62" rx="12" fill="#090b16" opacity=".82" stroke="${glow}" stroke-opacity=".6"/><text x="160" y="338" fill="${glow}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="700" letter-spacing="1">${esc(label)} · ${esc(item.id)}</text><text x="160" y="360" fill="#fff" text-anchor="middle" font-family="sans-serif" font-size="13">${esc(item.name||'')}</text><text x="160" y="386" fill="${glow}" text-anchor="middle" font-family="sans-serif" font-size="11">${item.attack??''}${item.health!==undefined?` / ${item.health}`:''}</text></svg>`;
}
for(const item of [...cards,...tokens]) await writeFile(new URL(`${item.id}.svg`,cardDir),art(item));
for(const [id,item] of Object.entries(SPELL_TABLE)) await writeFile(new URL(`${id}.svg`,spellDir),art({id,...item,tribe:'spell'},'spell'));
console.log(`Создано SVG: ${cards.length+tokens.length} карточек/токенов и ${Object.keys(SPELL_TABLE).length} заклинаний`);
