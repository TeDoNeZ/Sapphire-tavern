// Диагностика хранится только в браузере, без сетевой отправки.
export function createJournal(storage, {key='sapphire-diagnostics-v1', maxBytes=10000000}={}) {
  const session=globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  let entries=[], sequence=0, dropped=0, storageError=storage?null:'Хранилище браузера недоступно';
  const clone=value=>JSON.parse(JSON.stringify(value,(_,v)=>v instanceof Error?{name:v.name,message:v.message,stack:v.stack}:v));
  try { const saved=JSON.parse(storage?.getItem(key)||'null'); if(Array.isArray(saved?.entries)){entries=saved.entries;sequence=saved.sequence||0;dropped=saved.dropped||0;} } catch(error){storageError=String(error);}
  function persist(){
    let size=entries.reduce((sum,e)=>sum+JSON.stringify(e).length*2,0);
    while(size>maxBytes&&entries.length>1){size-=JSON.stringify(entries.shift()).length*2;dropped++;}
    const text=JSON.stringify({entries,sequence,dropped});
    if(!storage){storageError='Хранилище браузера недоступно';return;}
    try {storage.setItem(key,text);storageError=null;} catch(error){storageError=String(error);}
  }
  function record(type,details={},flush=true) {
    try {const entry=clone({number:++sequence,time:new Date().toISOString(),session,type,...details});entries.push(entry);if(flush)persist();return entry.number;}
    catch(error){storageError=`Ошибка записи журнала: ${error}`;return null;}
  }
  function report(){return clone({format:1,exportedAt:new Date().toISOString(),session,dropped,storageError,entries});}
  return {record,report,flush:persist,clear(){entries=[];dropped=0;record('Журнал очищен');}};
}

export function inspectState(s){
  const issues=[];
  for(const zone of ['board','hand','shop','discover'])if(!Array.isArray(s[zone]))issues.push(`Нет массива ${zone}`);
  if(s.board?.length>8)issues.push('На поле больше 8 существ');
  if(s.hand?.length>15)issues.push('В руке больше 15 карт');
  if(!Number.isFinite(s.gold)||s.gold<0)issues.push('Некорректное золото');
  const seen=new Set();
  for(const zone of ['board','hand','shop','discover'])for(const u of (Array.isArray(s[zone])?s[zone]:[])){
    if(!u?.uid){issues.push(`Нет UID: ${zone}`);continue;}
    if(seen.has(u.uid))issues.push(`Повтор UID ${u.uid}`);seen.add(u.uid);
    for(const stat of ['attack','health','maxHealth'])if(!Number.isFinite(u[stat]))issues.push(`${zone}: ${u.uid}, неверное ${stat}`);
  }
  return issues;
}
