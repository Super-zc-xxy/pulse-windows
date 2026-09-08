const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pulseAPI', {
  getMetrics: () => ipcRenderer.invoke('get-metrics'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  setExpanded: (expanded) => ipcRenderer.invoke('set-expanded', expanded),
  setWindowHeight: (height) => ipcRenderer.invoke('set-window-height', height),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  onMetricsUpdate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('metrics-update', handler);
    return () => ipcRenderer.removeListener('metrics-update', handler);
  },
  onConfigUpdate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('config-update', handler);
    return () => ipcRenderer.removeListener('config-update', handler);
  },
  onToggleSettings: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-settings', handler);
    return () => ipcRenderer.removeListener('toggle-settings', handler);
  },
  onOpenSettingsModal: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('open-settings-modal', handler);
    return () => ipcRenderer.removeListener('open-settings-modal', handler);
  }
});
