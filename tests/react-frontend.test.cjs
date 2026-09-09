const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Vite owns both React page entries and loads the bridge first', () => {
  for (const [file, entry] of [
    ['index.html', '/src/renderer/main.tsx'],
    ['accounts.html', '/src/accounts/main.tsx'],
  ]) {
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.indexOf('src="/pulse.js"') < html.indexOf(`src="${entry}"`));
    assert.match(html, /id="root"/);
  }

  const vite = fs.readFileSync('vite.config.ts', 'utf8');
  assert.match(vite, /accounts\.html/);
  assert.match(vite, /publicDir:\s*['"]src\/bridge['"]/);
});

test('settings is a shadcn accordion without provider data rendering', () => {
  const app = fs.readFileSync('src/accounts/AccountsApp.tsx', 'utf8');
  assert.match(app, /<Accordion[\s\S]*value=\{openProviders\}/);
  assert.match(app, /<ProviderSettings/);
  assert.doesNotMatch(app, /getProviderStatus/);

  for (const component of ['accordion', 'button', 'card', 'input', 'label', 'native-select', 'switch']) {
    assert.ok(fs.existsSync(`src/components/ui/${component}.tsx`), `${component} component is missing`);
  }
});

test('legacy DOM renderer scripts are no longer application entries', () => {
  assert.ok(!fs.existsSync('src/renderer/app.js'));
  assert.ok(!fs.existsSync('src/accounts/accounts.js'));
});

test('rail follows enabled providers and links missing credentials to their settings section', () => {
  const app = fs.readFileSync('src/renderer/App.tsx', 'utf8');
  const accounts = fs.readFileSync('src/accounts/AccountsApp.tsx', 'utf8');

  assert.match(app, /config\.providers\.filter\(\(provider\) => provider\.enabled\)/);
  assert.match(app, /getAuthStatus\(\)/);
  assert.match(app, /getProviderCapabilities\(\)/);
  assert.match(app, /尚未配置鉴权/);
  assert.match(app, /openSettings\(activeProvider\.id\)/);
  assert.match(accounts, /onFocusProvider/);
  assert.match(accounts, /value=\{openProviders\}/);
});

test('settings changes save immediately without a page-level save button or reload', () => {
  const accounts = fs.readFileSync('src/accounts/AccountsApp.tsx', 'utf8');

  assert.doesNotMatch(accounts, /id="save-settings"/);
  assert.match(accounts, /const updateConfig = async \(nextConfig: PulseConfig\)/);
  assert.match(accounts, /pulseApi\.saveConfig\(nextConfig\)/);
  assert.match(accounts, /onChange=\{\(nextConfig\) => void updateConfig\(nextConfig\)\}/);
  assert.match(accounts, /onConfigChange=\{\(nextConfig\) => void updateConfig\(nextConfig\)\}/);
});
