const { execFile } = require('child_process');
const util = require('util');
const path = require('path');
const os = require('os');
const fs = require('fs');

const execFileAsync = util.promisify(execFile);

class CursorProvider {
  constructor() {
    this.cachedUsage = null;
    this.lastFetchTime = 0;
    this.cacheTtlMs = 60 * 1000; // 60s cache
  }

  getDbPath() {
    return path.join(process.env.APPDATA || '', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }

  isAvailable() {
    return fs.existsSync(this.getDbPath());
  }

  formatResetTime(endIsoString) {
    if (!endIsoString) return '--';
    const end = new Date(endIsoString);
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    if (diffMs <= 0) return '已到重置期';

    const diffHours = Math.floor(diffMs / (1000 * 3600));
    const days = Math.floor(diffHours / 24);
    const hours = diffHours % 24;

    const month = end.getMonth() + 1;
    const date = end.getDate();

    if (days > 0) {
      return `${month}月${date}日 (${days}天后)`;
    }
    return `${hours}小时后`;
  }

  async fetchFromScript() {
    const scriptPath = path.join(__dirname, 'read_cursor.py');
    const { stdout } = await execFileAsync('python', [scriptPath], {
      timeout: 12000
    });
    return JSON.parse(stdout.trim() || '{}');
  }

  async getUsage() {
    if (!this.isAvailable()) return null;

    const now = Date.now();
    if (this.cachedUsage && (now - this.lastFetchTime < this.cacheTtlMs)) {
      return this.cachedUsage;
    }

    try {
      const data = await this.fetchFromScript();
      if (data.error) {
        console.warn('Cursor read returned error:', data.error);
        return this.cachedUsage || null;
      }

      const plan = data.individualUsage?.plan || {};
      const autoPercent = plan.autoPercentUsed !== undefined ? Math.round(plan.autoPercentUsed) : 60;
      const apiPercent = plan.apiPercentUsed !== undefined ? Math.round(plan.apiPercentUsed) : 0;
      const membership = (data.membershipType || 'pro').toUpperCase();
      const email = data.email || 'Cursor User';
      const resetStr = this.formatResetTime(data.billingCycleEnd);

      // Color interpolation matching usage
      let color = '#10b981';
      if (autoPercent >= 90) color = '#991b1b';
      else if (autoPercent >= 75) color = '#ef4444';
      else if (autoPercent >= 50) color = '#f59e0b';

      const result = {
        id: 'cursor',
        name: 'Cursor',
        icon: 'cursor',
        usedPercent: autoPercent,
        isGenerating: false,
        color: color,
        status: autoPercent >= 80 ? 'warning' : 'ok',
        primaryQuota: {
          label: 'Cursor Models (Grok & Composer)',
          used: `${autoPercent}%`,
          remaining: `${100 - autoPercent}%`,
          resetTime: resetStr,
          resetTimestamp: data.billingCycleEnd ? new Date(data.billingCycleEnd).getTime() : null
        },
        breakdown: [
          { name: 'Cursor Models (Grok & Composer)', used: autoPercent, max: 100, unit: '% used' },
          { name: 'Other Models', used: apiPercent, max: 100, unit: '% used' },
          { name: '当前套餐', used: 1, max: 1, unit: `${membership} $20/mo` },
          { name: '登录账号', used: 1, max: 1, unit: email }
        ],
        burnRate: {
          status: 'healthy',
          estimateText: `已用 ${autoPercent}%，重置于 ${resetStr}`,
          etaToExhaustion: '当前使用节奏平稳'
        },
        estimatedCost: '$20.00 / mo'
      };

      this.cachedUsage = result;
      this.lastFetchTime = now;
      return result;
    } catch (e) {
      console.warn('Cursor Async Provider Warning:', e.message);
      return this.cachedUsage || null;
    }
  }
}

module.exports = new CursorProvider();
