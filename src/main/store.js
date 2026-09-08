const fs = require('fs');
const path = require('path');
const os = require('os');

class Store {
  constructor() {
    this.configDir = path.join(os.homedir(), '.pulse-win');
    this.configFile = path.join(this.configDir, 'config.json');
    this.defaults = {
      dockSide: 'right', // 'right' | 'left'
      autoCollapse: true,
      collapseDelayMs: 2500,
      countdownMode: 'left', // 'used' (% used) | 'left' (% remaining)
      theme: 'obsidian', // 'obsidian' | 'liquid-glass'
      refreshIntervalSec: 60,
      demoMode: true, // starts with demo mode enabled for instant preview if no real credentials
      providers: [
        { id: 'claudeCode', name: 'Claude Code', enabled: true, customKey: '' },
        { id: 'codex', name: 'Codex', enabled: true, customKey: '' },
        { id: 'antigravity', name: 'Antigravity', enabled: true, customKey: '' },
        { id: 'cursor', name: 'Cursor', enabled: true, customKey: '' },
        { id: 'kimi', name: 'Kimi Code', enabled: true, customKey: '' },
        { id: 'glm', name: 'GLM Coding', enabled: false, customKey: '' },
        { id: 'deepseek', name: 'DeepSeek', enabled: false, customKey: '' }
      ]
    };
    this.data = this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        return { ...this.defaults, ...JSON.parse(raw) };
      }
    } catch (err) {
      console.error('Failed to read config, using defaults:', err);
    }
    return { ...this.defaults };
  }

  save() {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      fs.writeFileSync(this.configFile, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, val) {
    this.data[key] = val;
    this.save();
  }

  getAll() {
    return { ...this.data };
  }
}

module.exports = new Store();
