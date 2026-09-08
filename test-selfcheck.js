const assert = require('assert');
const store = require('./src/main/store');
const providerManager = require('./src/main/providers/index');
const mock = require('./src/main/providers/mock');

async function runCheck() {
  console.log('--- 1. Testing Store ---');
  assert(store.get('dockSide') === 'right' || store.get('dockSide') === 'left', 'dockSide should be right or left');
  assert(typeof store.get('countdownMode') === 'string', 'countdownMode should be string');
  assert(typeof store.get('demoMode') === 'boolean', 'demoMode should be boolean');
  console.log('✓ Store passed');

  console.log('--- 2. Testing Mock Provider ---');
  const mockData = mock.getMockData();
  assert(Array.isArray(mockData), 'mockData must be an array');
  assert(mockData.length >= 4, 'should have at least 4 providers in mock');
  const claude = mockData.find(p => p.id === 'claudeCode');
  assert(claude, 'claudeCode provider exists');
  assert(claude.usedPercent >= 0 && claude.usedPercent <= 100, 'usedPercent must be valid');
  assert(claude.primaryQuota && claude.primaryQuota.label, 'primaryQuota exists');
  console.log(`✓ Mock provider passed (${mockData.length} providers verified)`);

  console.log('--- 3. Testing ProviderManager Local Detection ---');
  const localEnvs = providerManager.detectLocalEnvironments();
  console.log('Local environments detected:', localEnvs);
  assert(typeof localEnvs.codex === 'boolean', 'codex detect must be boolean');
  assert(typeof localEnvs.claudeCode === 'boolean', 'claude detect must be boolean');
  console.log('✓ ProviderManager local detection passed');

  console.log('--- 4. Testing Aggregation Flow ---');
  const metrics = await providerManager.getMetrics();
  assert(Array.isArray(metrics) && metrics.length > 0, 'metrics should return active data');
  console.log(`✓ ProviderManager getMetrics returned ${metrics.length} providers`);

  console.log('\n======================================');
  console.log('🎉 All Pulse-Win self-checks PASSED!');
  console.log('======================================');
}

runCheck().catch(err => {
  console.error('Self check failed:', err);
  process.exit(1);
});
