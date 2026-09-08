// Realistic mock metrics for demo/preview mode to faithfully mirror macOS Pulse
module.exports = {
  getMockData() {
    const allMocks = [
      {
        id: 'claudeCode',
        name: 'Claude Code',
        icon: 'claude',
        usedPercent: 42,
        isGenerating: true, // active revolving dot
        color: '#10b981', // emerald green
        status: 'ok',
        primaryQuota: {
          label: '5-hour Session',
          used: '42%',
          remaining: '58%',
          resetTime: '2h 14m',
          resetTimestamp: Date.now() + (2 * 3600 + 14 * 60) * 1000
        },
        breakdown: [
          { name: 'Session Allowance', used: 42, max: 100, unit: '%' },
          { name: 'Weekly Hard Cap', used: 18, max: 100, unit: '%' },
          { name: 'Active Tokens', used: 142800, max: 200000, unit: 'tok' }
        ],
        burnRate: {
          status: 'stable',
          estimateText: 'Pace is stable (~8.2k tok/hr)',
          etaToExhaustion: null
        },
        estimatedCost: '$2.84 est.'
      },
      {
        id: 'codex',
        name: 'Codex',
        icon: 'openai',
        usedPercent: 78,
        isGenerating: false,
        color: '#f59e0b', // amber
        status: 'warning',
        primaryQuota: {
          label: 'Rolling 3-hour Limit',
          used: '78%',
          remaining: '22%',
          resetTime: '42m',
          resetTimestamp: Date.now() + 42 * 60 * 1000
        },
        breakdown: [
          { name: 'Group Rate Limit', used: 78, max: 100, unit: '%' },
          { name: 'Daily Budget', used: 64, max: 100, unit: '%' },
          { name: 'Active Agents', used: 2, max: 5, unit: 'threads' }
        ],
        burnRate: {
          status: 'warning',
          estimateText: 'High burn rate! Approaching window ceiling',
          etaToExhaustion: '~34 min remaining at current speed'
        },
        estimatedCost: '$5.12 est.'
      },
      {
        id: 'antigravity',
        name: 'Antigravity',
        icon: 'antigravity',
        usedPercent: 25,
        isGenerating: true,
        color: '#3b82f6', // blue / emerald
        status: 'ok',
        primaryQuota: {
          label: 'Daily Quota',
          used: '25%',
          remaining: '75%',
          resetTime: '8h 20m',
          resetTimestamp: Date.now() + 8.3 * 3600 * 1000
        },
        breakdown: [
          { name: 'Model Requests', used: 250, max: 1000, unit: 'req' },
          { name: 'Flash 3.8 Calls', used: 120, max: 500, unit: 'req' },
          { name: 'Subagent Concurrency', used: 1, max: 8, unit: 'slots' }
        ],
        burnRate: {
          status: 'healthy',
          estimateText: 'Comfortably within safe allowance',
          etaToExhaustion: null
        },
        estimatedCost: 'Included (Pro)'
      },
      {
        id: 'cursor',
        name: 'Cursor',
        icon: 'cursor',
        usedPercent: 92,
        isGenerating: false,
        color: '#ef4444', // red warning
        status: 'critical',
        primaryQuota: {
          label: 'Fast Requests Pool',
          used: '92%',
          remaining: '8%',
          resetTime: '3d 11h',
          resetTimestamp: Date.now() + (3 * 86400 + 11 * 3600) * 1000
        },
        breakdown: [
          { name: 'Fast GPT-4/Claude', used: 460, max: 500, unit: 'req' },
          { name: 'Slow Pool (unlimited)', used: 128, max: 9999, unit: 'req' }
        ],
        burnRate: {
          status: 'critical',
          estimateText: 'Risk of exhausting fast pool before billing cycle',
          etaToExhaustion: 'Est. exhausted in ~6.5 hours of active use'
        },
        estimatedCost: '$20.00 / mo'
      },
      {
        id: 'kimi',
        name: 'Kimi Code',
        icon: 'kimi',
        usedPercent: 15,
        isGenerating: false,
        color: '#10b981',
        status: 'ok',
        primaryQuota: {
          label: 'Balance & Concurrency',
          used: '15%',
          remaining: '85%',
          resetTime: 'N/A',
          resetTimestamp: null
        },
        breakdown: [
          { name: 'Account Balance', used: 15, max: 100, unit: '¥' },
          { name: 'TPM Quota', used: 18000, max: 100000, unit: 'tok' }
        ],
        burnRate: {
          status: 'healthy',
          estimateText: 'Balance adequate for normal usage',
          etaToExhaustion: null
        },
        estimatedCost: '¥85.00 remaining'
      }
    ];
    
    // Filter mock data by enabled toggles in settings
    const store = require('../store');
    const providerConfig = store.get('providers') || [];
    return allMocks.filter(m => {
      const p = providerConfig.find(x => x.id === m.id);
      return p ? p.enabled : false;
    });
  }
};
