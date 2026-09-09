(() => {
  const { invoke } = window.__TAURI__.core;
  const subscribe = (name, callback) => {
    let cancelled = false;
    let unlisten;
    window.__TAURI__.event.listen(name, event => {
      if (!cancelled) callback(event.payload);
    }).then(stop => {
      if (cancelled) stop();
      else unlisten = stop;
    }).catch(error => console.error('Pulse event subscription failed', name, error));
    return () => { cancelled = true; unlisten?.(); unlisten = undefined; };
  };
  window.pulseAPI = Object.freeze({
    getMetrics: () => invoke('get_metrics'),
    getConfig: () => invoke('get_config'),
    saveConfig: cfg => invoke('save_config', { cfg }),
    setExpanded: expanded => invoke('set_expanded', { expanded }).then(actual => {
      if (typeof actual === 'boolean') document.getElementById('app')?.classList.toggle('collapsed', !actual);
    }),
    setWindowHeight: height => invoke('set_window_height', { height }),
    openSettings: provider => invoke('open_settings', { provider: provider ?? null }),
    getSettingsTarget: () => invoke('get_settings_target'),
    quitApp: () => invoke('quit_app'),
    onMetricsUpdate: callback => subscribe('metrics-update', callback),
    onConfigUpdate: callback => subscribe('config-update', callback),
    onExpandedUpdate: callback => subscribe('expanded-update', callback),
    onToggleSettings: callback => subscribe('toggle-settings', callback),
    onFocusProvider: callback => subscribe('focus-provider', callback),
    getProviderCapabilities: () => invoke('get_provider_capabilities'),
    getAuthStatus: () => invoke('get_auth_status'),
    getProviderStatus: () => invoke('get_provider_status'),
    saveApiKey: (provider, key) => invoke('save_api_key', { provider, key }),
    startLogin: provider => invoke('start_login', { provider }),
    cancelLogin: attemptId => invoke('cancel_login', { attemptId }),
    logout: provider => invoke('logout', { provider }),
    onAuthUpdate: callback => subscribe('auth-update', callback),
    onLoginUpdate: callback => subscribe('login-update', callback),
  });
  document.addEventListener('mousedown', event => {
    if (event.button !== 0 || event.target.closest('button,input,select,a,.ring-item')) return;
    if (event.target.closest('#rail')) invoke('start_drag').catch(console.error);
  });
})();
