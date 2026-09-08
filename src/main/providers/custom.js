const store = require('../store');

class CustomModelProvider {
  getKimiUsage() {
    const keys = store.get('apiKeys') || {};
    const key = keys.kimi;
    const isConfigured = !!key;

    return {
      id: 'kimi',
      name: 'Kimi Code',
      icon: 'kimi',
      usedPercent: isConfigured ? 15 : 0,
      isGenerating: false,
      color: isConfigured ? '#10b981' : '#6b7280',
      status: isConfigured ? 'ok' : 'warning',
      primaryQuota: {
        label: isConfigured ? 'Moonshot Balance' : '待配置 API Key',
        used: isConfigured ? '15%' : '0%',
        remaining: isConfigured ? '85%' : '100%',
        resetTime: isConfigured ? '充值可用' : '点击齿轮配置',
        resetTimestamp: null
      },
      breakdown: [
        { name: '账号余额', used: isConfigured ? 85 : 0, max: 100, unit: '¥' },
        { name: 'API Key 凭据', used: isConfigured ? 1 : 0, max: 1, unit: isConfigured ? '已绑定' : '未设置' }
      ],
      burnRate: {
        status: isConfigured ? 'healthy' : 'warning',
        estimateText: isConfigured ? 'Kimi 额度充足' : '请在设置面板中填入 Kimi API Key',
        etaToExhaustion: null
      },
      estimatedCost: isConfigured ? '¥85.00' : '未配置'
    };
  }
  getGlmUsage() {
    const keys = store.get('apiKeys') || {};
    const key = keys.glm;
    const isConfigured = !!key;
    return {
      id: 'glm',
      name: 'GLM Coding',
      icon: 'openai',
      usedPercent: isConfigured ? 20 : 0,
      isGenerating: false,
      color: isConfigured ? '#38bdf8' : '#6b7280',
      status: isConfigured ? 'ok' : 'warning',
      primaryQuota: {
        label: isConfigured ? 'Zhipu Balance' : '待配置 API Key',
        used: isConfigured ? '20%' : '0%',
        remaining: isConfigured ? '80%' : '100%',
        resetTime: isConfigured ? '充值可用' : '点击齿轮配置',
        resetTimestamp: null
      },
      breakdown: [
        { name: 'API Key 凭据', used: isConfigured ? 1 : 0, max: 1, unit: isConfigured ? '已绑定' : '未设置' }
      ]
    };
  }

  getDeepSeekUsage() {
    const keys = store.get('apiKeys') || {};
    const key = keys.deepseek;
    const isConfigured = !!key;
    return {
      id: 'deepseek',
      name: 'DeepSeek',
      icon: 'openai',
      usedPercent: isConfigured ? 5 : 0,
      isGenerating: false,
      color: isConfigured ? '#38bdf8' : '#6b7280',
      status: isConfigured ? 'ok' : 'warning',
      primaryQuota: {
        label: isConfigured ? 'DeepSeek Balance' : '待配置 API Key',
        used: isConfigured ? '5%' : '0%',
        remaining: isConfigured ? '95%' : '100%',
        resetTime: isConfigured ? '充值可用' : '点击齿轮配置',
        resetTimestamp: null
      },
      breakdown: [
        { name: 'API Key 凭据', used: isConfigured ? 1 : 0, max: 1, unit: isConfigured ? '已绑定' : '未设置' }
      ]
    };
  }
}

module.exports = new CustomModelProvider();
