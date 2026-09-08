const { execFile } = require('child_process');
const util = require('util');
const path = require('path');
const execFileAsync = util.promisify(execFile);

class AntigravityProvider {
  constructor() {
    this.cachedUsage = null;
    this.lastFetchTime = 0;
    this.cacheTtlMs = 15 * 1000; // 15s cache
  }

  formatResetTime(isoStr) {
    if (!isoStr) return '--';
    const end = new Date(isoStr);
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    if (diffMs <= 0) return '即将刷新';

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}天 ${hours % 24}小时`;
    }
    return `${hours}小时 ${mins}分`;
  }

  async fetchFromScript() {
    const scriptPath = path.join(__dirname, 'read_antigravity.py');
    const { stdout } = await execFileAsync('python', [scriptPath], {
      timeout: 10000
    });
    return JSON.parse(stdout.trim() || '{}');
  }

  async getUsage() {
    const now = Date.now();
    if (this.cachedUsage && (now - this.lastFetchTime < this.cacheTtlMs)) {
      return this.cachedUsage;
    }

    try {
      const data = await this.fetchFromScript();
      if (!data.response || !data.response.groups) {
        return this.cachedUsage || null;
      }

      const groups = data.response.groups;
      const geminiGroup = groups.find(g => g.displayName.includes('Gemini')) || groups[0];
      const claudeGptGroup = groups.find(g => g.displayName.includes('Claude') || g.displayName.includes('GPT')) || groups[1];

      const fiveHourBucket = (geminiGroup?.buckets || []).find(b => b.window === '5h') || {};
      const weeklyBucket = (geminiGroup?.buckets || []).find(b => b.window === 'weekly') || {};

      // In Antigravity official API: remainingFraction is the exact remaining ratio (e.g. 0.8728 -> 87%)
      const rem5hFraction = fiveHourBucket.remainingFraction !== undefined ? fiveHourBucket.remainingFraction : 1.0;
      const remWeeklyFraction = weeklyBucket.remainingFraction !== undefined ? weeklyBucket.remainingFraction : 1.0;

      const rem5hPercent = Math.round(rem5hFraction * 100);
      const remWeeklyPercent = Math.round(remWeeklyFraction * 100);

      // Used percent is 100 - remaining
      const used5hPercent = 100 - rem5hPercent;
      const usedWeeklyPercent = 100 - remWeeklyPercent;

      // Claude and GPT group
      const cgWeeklyBucket = (claudeGptGroup?.buckets || []).find(b => b.window === 'weekly') || {};
      const cg5hBucket = (claudeGptGroup?.buckets || []).find(b => b.window === '5h') || {};
      const cgWeeklyRem = Math.round((cgWeeklyBucket.remainingFraction ?? 1.0) * 100);
      const cg5hRem = Math.round((cg5hBucket.remainingFraction ?? 1.0) * 100);

      const resetStr = this.formatResetTime(fiveHourBucket.resetTime);

      // Color based on how low the quota is
      let color = '#10b981';
      if (rem5hPercent <= 20) color = '#ef4444';
      else if (rem5hPercent <= 50) color = '#f59e0b';

      const result = {
        id: 'antigravity',
        name: 'Gemini (Antigravity)',
        icon: 'antigravity',
        usedPercent: used5hPercent,
        remainingPercent: rem5hPercent,
        isGenerating: true,
        color: color,
        status: rem5hPercent <= 25 ? 'warning' : 'ok',
        primaryQuota: {
          label: 'Five Hour Limit (5小时限额)',
          used: `${used5hPercent}%`,
          remaining: `${rem5hPercent}%`,
          resetTime: resetStr,
          resetTimestamp: fiveHourBucket.resetTime ? new Date(fiveHourBucket.resetTime).getTime() : null
        },
        breakdown: [
          {
            name: 'Five Hour Limit Remaining',
            used: rem5hPercent,
            max: 100,
            unit: '%',
            desc: fiveHourBucket.description || ''
          },
          {
            name: 'Weekly Limit Remaining',
            used: remWeeklyPercent,
            max: 100,
            unit: '%',
            desc: weeklyBucket.description || ''
          },
          {
            name: 'Claude and GPT (Weekly Remaining)',
            used: cgWeeklyRem,
            max: 100,
            unit: '%'
          },
          {
            name: 'Claude and GPT (Five Hour Remaining)',
            used: cg5hRem,
            max: 100,
            unit: '%'
          }
        ],
        burnRate: {
          status: 'healthy',
          estimateText: fiveHourBucket.description || '当前 5 小时限额消耗良好',
          etaToExhaustion: `距离完全刷新还有：${resetStr}`
        },
        estimatedCost: 'Included in Gemini Pro'
      };

      this.cachedUsage = result;
      this.lastFetchTime = now;
      return result;
    } catch (e) {
      console.warn('Antigravity Provider Warning:', e.message);
      return this.cachedUsage || null;
    }
  }
}

module.exports = new AntigravityProvider();
