const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('bridge forwards commands and cancels pending event registration', async () => {
  const calls = []; let finish; let handler; let stopped = 0;
  const window = { __TAURI__: {
    core: { invoke: (...args) => { calls.push(args); return Promise.resolve(); } },
    event: { listen: (name, fn) => { handler = fn; return new Promise(resolve => { finish = resolve; }); } },
  } };
  vm.runInNewContext(fs.readFileSync('src/bridge/pulse.js', 'utf8'), { window, document: { addEventListener() {} }, console });
  const api = window.pulseAPI;
  await api.saveConfig({ demoMode: false });
  assert.equal(JSON.stringify(calls.pop()), '["save_config",{"cfg":{"demoMode":false}}]');
  for (const name of ['getMetrics', 'getConfig', 'openSettings', 'quitApp']) await api[name]();
  await api.setExpanded(true); await api.setWindowHeight(680);
  assert.equal(calls.length, 6);
  let received = 0;
  const stop = api.onMetricsUpdate(() => received++);
  handler({ payload: [] }); stop(); handler({ payload: [] });
  finish(() => stopped++); await Promise.resolve(); stop();
  assert.equal(received, 1); assert.equal(stopped, 1);
});

test('build inserts bridge before renderer without modifying renderer source', async () => {
  const {execFileSync}=require('node:child_process');
  const before=fs.readFileSync('src/renderer/index.html','utf8');
  execFileSync(process.execPath,['scripts/build-frontend.mjs']);
  const built=fs.readFileSync('dist/frontend/index.html','utf8');
  assert.ok(built.indexOf('src="pulse.js"')<built.indexOf('src="app.js"'));
  assert.equal(fs.readFileSync('src/renderer/index.html','utf8'),before);
  assert.ok(fs.existsSync('dist/frontend/accounts.html'));
});

test('all event methods forward payload and unsubscribe only once', async () => {
  let listener;let removed=0;let eventName;
  const window={__TAURI__:{core:{invoke:()=>Promise.resolve()},event:{listen:(name,callback)=>{eventName=name;listener=callback;return Promise.resolve(()=>removed++);}}}};
  vm.runInNewContext(fs.readFileSync('src/bridge/pulse.js','utf8'),{window,document:{addEventListener(){}},console});
  for(const [method,event] of [['onMetricsUpdate','metrics-update'],['onConfigUpdate','config-update'],['onExpandedUpdate','expanded-update'],['onToggleSettings','toggle-settings'],['onAuthUpdate','auth-update'],['onLoginUpdate','login-update']]) {
    let payload;const stop=window.pulseAPI[method](value=>payload=value);await Promise.resolve();
    listener({payload:'value'});assert.equal(payload,'value');assert.equal(eventName,event);stop();stop();
    listener({payload:'late'});assert.equal(payload,'value');
  }
  assert.equal(removed,6);
});
