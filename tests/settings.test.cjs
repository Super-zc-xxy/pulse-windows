const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('reset presentation supports epoch numbers, numeric strings and ISO dates',async()=>{
  const {formatReset}=await import('../src/lib/format.ts');
  const now=Date.now();const future=Math.floor(now/1000)+7200;
  const result=[formatReset(future,now),formatReset(String(future),now),formatReset(new Date(future*1000).toISOString(),now),formatReset(null,now),formatReset('invalid',now),formatReset(1,now)];
  assert.match(result[0],/小时/);
  assert.equal(result[0],result[1]);assert.equal(result[0],result[2]);
  assert.equal(result[3],'未提供');assert.equal(result[4],'未提供');assert.equal(result[5],'等待刷新');
});

test('settings button opens the dedicated window and the window owns display preferences',()=>{
  const app=fs.readFileSync('src/renderer/App.tsx','utf8');
  const settings=fs.readFileSync('src/accounts/components/GeneralSettings.tsx','utf8');
  const native=fs.readFileSync('src-tauri/src/desktop.rs','utf8');
  assert.match(app,/btn-settings[\s\S]*pulseApi\.openSettings\(\)/);
  for(const id of ['dock-side','countdown-mode','demo-mode']) assert.match(settings,new RegExp(`id="${id}"`));
  assert.match(native,/"settings",\s*tauri::WebviewUrl::App\("accounts\.html"/);
});
