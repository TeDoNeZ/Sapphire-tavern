/* Telegram Mini App adapter. Backend is unchanged: API_BASE may be configured by query string. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const API_BASE = (params.get('api') || '').replace(/\/$/, '');
  const tg = window.Telegram?.WebApp;
  const defaults = {beast:'Зверь',pirate:'Пират',dragon:'Дракон',elemental:'Элементаль',custom:'Свой'};
  const seed = [{id:'card-0',name:'Альфа-волк',archetype:'beast',tier:1,attack:2,health:2,text:'Боевой клич: дайте всем зверям +1/+0 (на этот бой).',keywords:[],asset:'../archive/legacy-assets/beasts/alpha_wolf.png'}];
  let cards = read('sapphire-cards', seed), labels = {...defaults,...read('sapphire-types', {})}, selected = cards[0]?.id || null;
  const state = {filter:'all'};
  function read(key, fallback){try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback}}
  function save(){localStorage.setItem('sapphire-cards',JSON.stringify(cards));localStorage.setItem('sapphire-types',JSON.stringify(labels))}
  function esc(v){return String(v ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function notify(message){$('status').textContent=message;setTimeout(()=>{$('status').textContent=''},2500)}
  function options(){const a=$('archetype'), old=a.value;a.innerHTML=Object.entries(labels).map(([k,v])=>`<option value="${esc(k)}">${esc(v)}</option>`).join('');if(labels[old])a.value=old}
  function image(c){return c.image || c.asset || ''}
  function current(){return cards.find(c=>c.id===selected)}
  function renderList(){const q=$('search').value.trim().toLowerCase();const shown=cards.filter(c=>(state.filter==='all'||c.archetype===state.filter)&&String(c.name).toLowerCase().includes(q));$('cardList').innerHTML=shown.length?shown.map(c=>`<button type="button" class="list-card ${c.id===selected?'active':''}" data-id="${esc(c.id)}"><span><strong>${esc(c.name)}</strong><small>${esc(labels[c.archetype]||c.archetype)} · тир ${c.tier}</small></span><span class="tier-dot">${c.tier}</span></button>`).join(''):$('empty').innerHTML;$('cardList').querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{selected=b.dataset.id;loadForm();renderList()})}
  function renderPreview(){const c=current();if(!c){$('preview').innerHTML='<p class="empty">Выберите карту</p>';return}const src=image(c);$('preview').innerHTML=`${src?`<img class="art" src="${esc(src)}" alt="" onerror="this.remove()">`:'<div class="art-fallback">✦</div>'}<div class="card-info"><span class="eyebrow">${esc(labels[c.archetype]||c.archetype)} · ТИР ${c.tier}</span><h3>${esc(c.name)}</h3><div class="stats"><span class="attack">⚔ ${c.attack}</span><span class="health">♥ ${c.health}</span></div><p>${esc(c.text)||'Без способности'}</p><div>${(c.keywords||[]).map(k=>`<span class="tag">${esc(k)}</span>`).join('')}</div></div>`}
  function loadForm(){const c=current();if(!c){$('form').reset();renderPreview();return}options();for(const k of ['name','archetype','tier','attack','health','text','asset'])$(k).value=c[k]??'';$('keywords').value=(c.keywords||[]).join(', ');renderPreview()}
  function sync(){const c=current();if(!c)return;Object.assign(c,{name:$('name').value.trim()||'Безымянное существо',archetype:$('archetype').value,tier:+$('tier').value||1,attack:+$('attack').value||0,health:+$('health').value||1,text:$('text').value.trim(),keywords:$('keywords').value.split(',').map(x=>x.trim()).filter(Boolean),asset:$('asset').value.trim()});save();renderList();renderPreview()}
  async function api(path,init){if(!API_BASE)return null;try{const r=await fetch(`${API_BASE}${path}`,{headers:{'Content-Type':'application/json'},...init});if(!r.ok)throw Error(r.status);return await r.json()}catch(e){notify('API недоступен — используются локальные данные');return null}}
  async function loadApi(){const [remote] = await Promise.all([api('/api/cards'),api('/api/folders'),api('/api/images')]);if(Array.isArray(remote)&&remote.length){cards=remote.map((c,i)=>({...c,id:c.id||`remote-${i}`,keywords:c.keywords||[]}));selected=cards[0].id;save();loadForm();renderList();notify('Карты загружены из API')}}
  $('form').onsubmit=async e=>{e.preventDefault();sync();const c=current();if(c)await api(`/api/cards/${encodeURIComponent(c.id)}`,{method:'PUT',body:JSON.stringify(c)});notify('Карта сохранена')};
  $('newBtn').onclick=()=>{const c={id:`card-${Date.now()}`,name:'Новое существо',archetype:'custom',tier:1,attack:1,health:1,text:'',keywords:[],asset:''};cards.unshift(c);selected=c.id;save();loadForm();renderList()};
  $('duplicateBtn').onclick=()=>{const c=current();if(!c)return;const copy={...c,id:`card-${Date.now()}`,name:`${c.name} — копия`,keywords:[...(c.keywords||[])]};cards.unshift(copy);selected=copy.id;save();loadForm();renderList()};
  $('deleteBtn').onclick=()=>{if(cards.length<2)return notify('Нельзя удалить последнюю карту');cards=cards.filter(c=>c.id!==selected);selected=cards[0].id;save();loadForm();renderList();notify('Карта удалена')};
  $('search').oninput=renderList;$('filter').onchange=e=>{state.filter=e.target.value;renderList()};
  document.querySelectorAll('#form input,#form textarea,#form select').forEach(el=>el.addEventListener('input',()=>{renderPreview()}));
  options();Object.entries(labels).forEach(([k,v])=>{if(k!=='custom')$('filter').insertAdjacentHTML('beforeend',`<option value="${esc(k)}">${esc(v)}</option>`)});renderList();loadForm();loadApi();
  if(tg){tg.ready();tg.expand();tg.BackButton.show();tg.BackButton.onClick(()=>history.length>1?history.back():tg.close());tg.onEvent?.('themeChanged',()=>document.documentElement.style.colorScheme=tg.colorScheme||'dark');document.documentElement.style.colorScheme=tg.colorScheme||'dark';}
})();
