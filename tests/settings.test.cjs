const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(saveConfig) {
  const elements=new Map();
  function get(id) {
    if(!elements.has(id)) {
      const classes=new Set();
      elements.set(id,{value:'',checked:true,style:{},children:[],handlers:{},textContent:'',disabled:false,
        addEventListener(name,fn){this.handlers[name]=fn;},appendChild(){},
        classList:{add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),contains:n=>classes.has(n)}});
    }
    return elements.get(id);
  }
  const config={dockSide:'right',countdownMode:'left',demoMode:false,providers:[{id:'codex',enabled:true}]};
  const document={getElementById:get,querySelectorAll:()=>[],querySelector:selector=>({value:selector.includes('dockSide')?'left':selector.includes('demoMode')?'false':'left'})};
  const window={addEventListener(){},pulseAPI:{getConfig:async()=>config,getMetrics:()=>new Promise(()=>{}),saveConfig,onConfigUpdate(){},onMetricsUpdate(){},onExpandedUpdate(){}}};
  const context=vm.createContext({document,window,setTimeout:()=>1,clearTimeout(){},console});
  vm.runInContext(fs.readFileSync('src/renderer/app.js','utf8'),context);
  return {get,context,config};
}
test('settings closes and confirms a successful save without awaiting metrics',async()=>{
  let finish;let calls=0;
  const {get,config}=setup(cfg=>{calls++;return new Promise(resolve=>finish=()=>resolve(cfg));});
  await Promise.resolve();
  const save=get('btn-save-settings');
  const pending=save.handlers.click({stopPropagation(){}});
  assert.equal(save.disabled,true);
  assert.match(save.textContent,/保存中/);
  assert.equal(config.dockSide,'right');
  await save.handlers.click({stopPropagation(){}});
  assert.equal(calls,1);
  finish();await pending;
  assert.ok(get('settings-modal').classList.contains('hidden'));
  assert.match(get('settings-feedback').textContent,/已保存/);
  assert.equal(save.disabled,false);
});
test('settings save failure remains open, reports error and permits retry',async()=>{
  const {get,config}=setup(async()=>{throw new Error('Cannot replace configuration');});
  await Promise.resolve();
  await get('btn-save-settings').handlers.click({stopPropagation(){}});
  assert.ok(!get('settings-modal').classList.contains('hidden'));
  assert.match(get('settings-feedback').textContent,/保存失败.*Cannot replace configuration/);
  assert.equal(get('btn-save-settings').disabled,false);
  assert.equal(config.dockSide,'right');
});

test('reset presentation supports epoch numbers, numeric strings and ISO dates',()=>{
  const {context}=setup(async cfg=>cfg);
  const future=Math.floor(Date.now()/1000)+7200;
  context.future=future;
  const result=vm.runInContext('[formatReset(future),formatReset(String(future)),formatReset(new Date(future*1000).toISOString()),formatReset(null),formatReset("invalid"),formatReset(1)]',context);
  assert.match(result[0],/小时/);
  assert.equal(result[0],result[1]);assert.equal(result[0],result[2]);
  assert.equal(result[3],'未提供');assert.equal(result[4],'未提供');assert.equal(result[5],'等待刷新');
});

test('settings button opens the dedicated window and the window owns display preferences',()=>{
  const app=fs.readFileSync('src/renderer/app.js','utf8');
  const html=fs.readFileSync('src/accounts/accounts.html','utf8');
  const native=fs.readFileSync('src-tauri/src/desktop.rs','utf8');
  assert.match(app,/btn-settings[\s\S]*pulseAPI\.openSettings\(\)/);
  for(const id of ['dock-side','countdown-mode','demo-mode','save-settings']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(native,/"settings",\s*tauri::WebviewUrl::App\("accounts\.html"/);
});
