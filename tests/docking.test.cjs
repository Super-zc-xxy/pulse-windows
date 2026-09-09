const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('React renderer derives docking and collapse classes independently', () => {
  const app=fs.readFileSync('src/renderer/App.tsx','utf8');
  assert.match(app,/`dock-\$\{config\.dockSide\}\$\{expanded \? '' : ' collapsed'\}`/);
  assert.match(app,/onConfigUpdate\(setConfig\)/);
  assert.match(app,/onExpandedUpdate/);
});
