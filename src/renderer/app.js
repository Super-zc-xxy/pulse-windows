// Provider Icons in inline SVG for sharp rendering without asset loading latency
const ICONS = {
  claude: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/></svg>`,
  openai: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 9 9M12 12l6.36 6.36M12 12L5.64 5.64M12 12l-6.36 6.36M12 12l6.36-6.36"/></svg>`,
  antigravity: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 22,12 12,22 2,12"/><circle cx="12" cy="12" r="3" fill="#0e1014"/></svg>`,
  cursor: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 2l16 8.5-8.5 2.5-2.5 8.5L4 2z"/></svg>`,
  kimi: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8A9.034 9.034 0 0 0 12 3z"/></svg>`,
  default: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>`
};

const appEl = document.getElementById('app');
const sliverEl = document.getElementById('edge-sliver');
const railEl = document.getElementById('rail');
const ringsListEl = document.getElementById('rings-list');
const detailCardEl = document.getElementById('detail-card');
const settingsModalEl = document.getElementById('settings-modal');

let currentMetrics = [];
let currentConfig = {
  dockSide: 'right',
  countdownMode: 'used',
  autoCollapse: true,
  demoMode: true
};

let collapseTimer = null;
let activeItemIndex = null;

// Color helper
function getUsageColor(percent) {
  if (percent >= 90) return 'var(--accent-deep-red)';
  if (percent >= 75) return 'var(--accent-red)';
  if (percent >= 50) return 'var(--accent-amber)';
  return 'var(--accent-green)';
}

// Expand & Collapse Logic
function expand() {
  if (collapseTimer) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }
  if (appEl.classList.contains('collapsed')) {
    appEl.classList.remove('collapsed');
    window.pulseAPI.setExpanded(true);
  }
}

function scheduleCollapse(delay = 2000) {
  if (settingsModalEl && !settingsModalEl.classList.contains('hidden')) return;
  if (collapseTimer) clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => {
    if (settingsModalEl && !settingsModalEl.classList.contains('hidden')) return;
    hideDetailCard();
    appEl.classList.add('collapsed');
    window.pulseAPI.setExpanded(false);
  }, delay);
}

// Event Listeners for Hover Interaction
sliverEl.addEventListener('mouseenter', expand);
sliverEl.addEventListener('click', expand);
sliverEl.addEventListener('mousedown', expand);
railEl.addEventListener('mouseenter', expand);
detailCardEl.addEventListener('mouseenter', expand);

appEl.addEventListener('mouseleave', (e) => {
  // If the mouse is still inside the document bounds, it's a false leave (often caused by window resize or transparent areas)
  if (e.clientX > 0 && e.clientX < window.innerWidth && e.clientY > 0 && e.clientY < window.innerHeight) {
    return;
  }
  scheduleCollapse(150); // Almost instantly hide when mouse truly leaves
});

window.addEventListener('blur', () => {
  scheduleCollapse(150);
});

appEl.addEventListener('click', (e) => {
  // If the user clicks the invisible background (not the rail or detail card), collapse immediately
  if (e.target === appEl) {
    scheduleCollapse(0);
  }
});

// Render Rings
function renderRings() {
  ringsListEl.innerHTML = '';
  const isLeftMode = currentConfig.countdownMode === 'left';

  currentMetrics.forEach((m, idx) => {
    const ring = document.createElement('div');
    ring.className = 'ring-item';
    ring.dataset.index = idx;

    const displayPercent = isLeftMode ? (100 - m.usedPercent) : m.usedPercent;
    const color = getUsageColor(m.usedPercent);

    // SVG radius 18 => C = 2 * PI * 18 = 113.097
    const c = 113.1;
    const offset = c * (1 - (displayPercent / 100));

    const iconSvg = ICONS[m.icon] || ICONS.default;

    ring.innerHTML = `
      <svg class="gauge-svg" viewBox="0 0 44 44">
        <circle class="gauge-track" cx="22" cy="22" r="18" />
        <circle class="gauge-progress" cx="22" cy="22" r="18"
          stroke="${color}"
          stroke-dasharray="${c}"
          stroke-dashoffset="${offset}"
        />
      </svg>
      ${m.isGenerating ? '<div class="revolving-dot"></div>' : ''}
      <div class="ring-center">
        <div class="ring-icon">${iconSvg}</div>
      </div>
    `;

    // Hover triggers detail card
    ring.addEventListener('mouseenter', (e) => {
      showDetailCard(idx, ring);
    });

    ringsListEl.appendChild(ring);
  });
}

// Show Detail Popout Card
function showDetailCard(index, targetElement) {
  activeItemIndex = index;
  const m = currentMetrics[index];
  if (!m) return;

  const isLeftMode = currentConfig.countdownMode === 'left';
  const displayPercent = isLeftMode ? (100 - m.usedPercent) : m.usedPercent;
  const color = getUsageColor(m.usedPercent);

  document.getElementById('card-icon').innerHTML = ICONS[m.icon] || ICONS.default;
  document.getElementById('card-title').textContent = m.name;
  document.getElementById('card-subtitle').textContent = m.primaryQuota?.label || '配额监控';

  const badgeEl = document.getElementById('card-badge');
  badgeEl.className = `status-badge ${m.status}`;
  badgeEl.textContent = m.status === 'ok' ? '状态健康' : (m.status === 'warning' ? '额度偏紧' : '极度告急');

  const percentEl = document.getElementById('card-percent');
  percentEl.textContent = `${displayPercent}%`;
  percentEl.style.color = color;
  document.getElementById('card-percent-label').textContent = isLeftMode ? '剩余可用配额' : '已消耗配额';

  document.getElementById('card-reset-time').textContent = m.primaryQuota?.resetTime || '--';
  document.getElementById('card-cost').textContent = m.estimatedCost || '--';

  // Breakdown pools
  const breakdownListEl = document.getElementById('card-breakdown');
  breakdownListEl.innerHTML = '';
  (m.breakdown || []).forEach(b => {
    const row = document.createElement('div');
    row.className = 'pool-row';
    const percent = Math.min(100, Math.round((b.used / b.max) * 100));
    const valText = b.unit === '%' ? `${b.used}%` : `${b.used.toLocaleString()} / ${b.max.toLocaleString()} ${b.unit}`;
    row.innerHTML = `
      <div class="pool-meta">
        <span class="pool-name">${b.name}</span>
        <span class="pool-val">${valText}</span>
      </div>
      ${b.desc ? `<div style="font-size: 10px; color: var(--text-dim); margin-top: 2px;">${b.desc}</div>` : ''}
      <div class="pool-bar-track" style="margin-top: 4px;">
        <div class="pool-bar-fill" style="width: ${percent}%; background: ${color}"></div>
      </div>
    `;
    breakdownListEl.appendChild(row);
  });

  // Burn rate
  const burnTitleEl = document.getElementById('burn-title');
  const burnEtaEl = document.getElementById('burn-eta');
  if (m.burnRate) {
    burnTitleEl.textContent = m.burnRate.estimateText || '消耗速度评估';
    burnEtaEl.textContent = m.burnRate.etaToExhaustion || '当前速度可平稳撑过本周期';
  }

  // Remove hidden first so we can measure the real DOM size
  detailCardEl.classList.remove('hidden');
  const cardHeight = detailCardEl.offsetHeight;
  const cardWidth = detailCardEl.offsetWidth;

  // Adjust card vertical position to align with hovered ring
  const rect = targetElement.getBoundingClientRect();
  if (currentConfig.dockSide === 'top') {
    detailCardEl.style.top = '70px';
    detailCardEl.style.left = `${Math.max(10, Math.min(window.innerWidth - cardWidth - 10, rect.left - 130))}px`;
  } else {
    detailCardEl.style.left = '';
    detailCardEl.style.top = `${Math.max(10, Math.min(window.innerHeight - cardHeight - 10, rect.top - 20))}px`;
  }
}

function hideDetailCard() {
  detailCardEl.classList.add('hidden');
  activeItemIndex = null;
}

// Settings Modal Management
document.getElementById('btn-settings').addEventListener('click', (e) => {
  e.stopPropagation();
  openSettings();
});

document.getElementById('modal-close').addEventListener('click', (e) => {
  e.stopPropagation();
  closeSettings();
});

const btnModalQuit = document.getElementById('btn-modal-quit');
if (btnModalQuit) {
  btnModalQuit.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('确定要完全退出 Pulse 悬浮监视器吗？')) {
      window.pulseAPI.quitApp();
    }
  });
}

function openSettings() {
  expand();
  if (collapseTimer) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }

  // Removed the call to standalone settings window to consolidate settings into this modal

  // 填充并显示悬浮栏内嵌设置面板
  const radiosDock = document.querySelectorAll('input[name="dockSide"]');
  radiosDock.forEach(r => { r.checked = (r.value === currentConfig.dockSide); });

  const radiosCount = document.querySelectorAll('input[name="countdownMode"]');
  radiosCount.forEach(r => { r.checked = (r.value === currentConfig.countdownMode); });

  const radiosDemo = document.querySelectorAll('input[name="demoMode"]');
  radiosDemo.forEach(r => { r.checked = (r.value === String(currentConfig.demoMode)); });

  // Load API keys
  if (currentConfig.apiKeys) {
    const kInput = document.getElementById('input-kimi-key');
    if (kInput) kInput.value = currentConfig.apiKeys.kimi || '';
    const gInput = document.getElementById('input-glm-key');
    if (gInput) gInput.value = currentConfig.apiKeys.glm || '';
    const dInput = document.getElementById('input-deepseek-key');
    if (dInput) dInput.value = currentConfig.apiKeys.deepseek || '';
  }

  // Load provider status
  if (currentConfig.providers) {
    currentConfig.providers.forEach(p => {
      const mappedId = p.id === 'claudeCode' ? 'claude' : p.id.toLowerCase();
      const chk = document.getElementById(`chk-${mappedId}`);
      if (chk) chk.checked = p.enabled;
    });
  }

  hideDetailCard();
  settingsModalEl.classList.remove('hidden');
}

function closeSettings() {
  settingsModalEl.classList.add('hidden');
  scheduleCollapse(2000);
}


document.getElementById('btn-save-settings').addEventListener('click', async (e) => {
  e.stopPropagation();
  const dockSide = document.querySelector('input[name="dockSide"]:checked').value;
  const countdownMode = document.querySelector('input[name="countdownMode"]:checked').value;
  const demoMode = document.querySelector('input[name="demoMode"]:checked').value === 'true';

  const kimiKey = (document.getElementById('input-kimi-key')?.value || '').trim();
  const glmKey = (document.getElementById('input-glm-key')?.value || '').trim();
  const deepseekKey = (document.getElementById('input-deepseek-key')?.value || '').trim();

  currentConfig.dockSide = dockSide;
  currentConfig.countdownMode = countdownMode;
  currentConfig.demoMode = demoMode;
  currentConfig.apiKeys = {
    kimi: kimiKey,
    glm: glmKey,
    deepseek: deepseekKey
  };

  if (currentConfig.providers) {
    currentConfig.providers.forEach(p => {
      const mappedId = p.id === 'claudeCode' ? 'claude' : p.id.toLowerCase();
      const chk = document.getElementById(`chk-${mappedId}`);
      if (chk) p.enabled = chk.checked;
    });
  }

  appEl.className = `dock-${dockSide}`;

  await window.pulseAPI.saveConfig(currentConfig);

  closeSettings();
  await loadData();
});

// Load metrics & config
async function loadData() {
  currentConfig = await window.pulseAPI.getConfig();
  appEl.className = `dock-${currentConfig.dockSide || 'right'}`;

  currentMetrics = await window.pulseAPI.getMetrics();
  renderRings();
}

// Listen to push events
window.pulseAPI.onMetricsUpdate((data) => {
  currentMetrics = data;
  renderRings();
  if (activeItemIndex !== null) {
    const ringEl = ringsListEl.children[activeItemIndex];
    if (ringEl) showDetailCard(activeItemIndex, ringEl);
  }
});

window.pulseAPI.onConfigUpdate((cfg) => {
  currentConfig = cfg;
  appEl.className = `dock-${currentConfig.dockSide || 'right'}`;
  
  // Sync settings panel UI if it's open
  const radiosDock = document.querySelectorAll('input[name="dockSide"]');
  radiosDock.forEach(r => { r.checked = (r.value === currentConfig.dockSide); });
  
  renderRings();
});

if (window.pulseAPI.onToggleSettings) {
  window.pulseAPI.onToggleSettings(() => {
    toggleSettings();
  });
}

window.pulseAPI.onOpenSettingsModal(() => {
  openSettings();
});

function toggleSettings() {
  if (settingsModalEl.classList.contains('hidden')) {
    openSettings();
  } else {
    closeSettings();
  }
}

// Initialization
loadData();
// Give 6s on initial launch so the user can clearly see the dock before auto-collapsing
scheduleCollapse(6000);
