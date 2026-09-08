const { Tray, Menu, nativeImage, app } = require('electron');
const store = require('./store');
const path = require('path');

let tray = null;

function createTray(mainWindow, onToggleDock, onToggleMode, onOpenSettings) {
  const iconPath = path.join(__dirname, '../../assets/icon.ico');
  tray = new Tray(iconPath);
  tray.setToolTip('Pulse - AI Allowance Monitor');

  const updateContextMenu = () => {
    const dockSide = store.get('dockSide') || 'right';
    const countdownMode = store.get('countdownMode') || 'used';
    const demoMode = store.get('demoMode') ?? true;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Pulse 边缘监视器',
        enabled: false
      },
      { type: 'separator' },
      {
        label: `停靠侧: ${dockSide === 'right' ? '右侧' : (dockSide === 'left' ? '左侧' : '顶部')}`,
        submenu: [
          {
            label: '停靠在右侧',
            type: 'radio',
            checked: dockSide === 'right',
            click: () => onToggleDock('right')
          },
          {
            label: '停靠在左侧',
            type: 'radio',
            checked: dockSide === 'left',
            click: () => onToggleDock('left')
          },
          {
            label: '停靠在顶部',
            type: 'radio',
            checked: dockSide === 'top',
            click: () => onToggleDock('top')
          }
        ]
      },
      {
        label: `计数模式: ${countdownMode === 'used' ? '已用百分比' : '剩余额度'}`,
        submenu: [
          {
            label: '显示已消耗 (% used)',
            type: 'radio',
            checked: countdownMode === 'used',
            click: () => onToggleMode('used')
          },
          {
            label: '显示剩余可用 (% left)',
            type: 'radio',
            checked: countdownMode === 'left',
            click: () => onToggleMode('left')
          }
        ]
      },
      {
        label: '演示预览模式 (Mock)',
        type: 'checkbox',
        checked: demoMode,
        click: (item) => {
          store.set('demoMode', item.checked);
          mainWindow.webContents.send('config-update', store.getAll());
        }
      },
      {
        label: '偏好设置与账号管理...',
        click: () => onOpenSettings()
      },
      { type: 'separator' },
      {
        label: '刷新配额数据',
        click: async () => {
          try {
            console.log('Refresh clicked');
            const providerManager = require('./providers/index');
            const metrics = await providerManager.getMetrics();
            console.log('Metrics fetched:', metrics.length);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('metrics-update', metrics);
              console.log('Metrics sent to UI');
            }
          } catch (e) {
            console.error('Refresh error:', e);
          }
        }
      },
      {
        label: '退出 Pulse',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
  };

  updateContextMenu();

  tray.on('click', () => {
    onOpenSettings();
  });

  return {
    updateContextMenu
  };
}

module.exports = { createTray };
