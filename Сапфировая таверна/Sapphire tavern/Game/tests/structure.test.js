import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const exists=async url=>assert.ok((await stat(url)).isFile(),fileURLToPath(url));

test('структура: HTML подключает существующие CSS и главный модуль',async()=>{
 const html=await readFile(new URL('index.html',root),'utf8');
 for(const [,path] of html.matchAll(/(?:src|href)="(\.\/[^"\s]+)"/g))await exists(new URL(path,root));
 assert.match(html,/src="\.\/src\/app\.js"/); assert.match(html,/href="\.\/styles\/styles\.css"/);
});

test('структура: локальные импорты исходников и тестов разрешаются',async()=>{
 for(const folder of ['src/','tests/','tools/']){const base=new URL(folder,root);for(const name of await readdir(base)){if(!/\.(?:js|mjs)$/.test(name))continue;const file=new URL(name,base),text=await readFile(file,'utf8');for(const [,path] of text.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g))await exists(new URL(path,file));}}
});

test('структура: CSS-ссылки остаются локальными',async()=>{
 const file=new URL('styles/styles.css',root),css=await readFile(file,'utf8');
 for(const [,path] of css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)){if(/^(?:data:|https?:)/.test(path))continue;assert.ok(!path.includes('fresh/'));}
});
