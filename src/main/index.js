const { app, BrowserWindow, screen, ipcMain, dialog } = require('electron');
const path = require('path');
const store = require('./store');
const providerManager = require('./providers/index');
const { createTray } = require('./tray');

// Disable Chromium background phone-home / telemetry requests
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,CertificateTransparencyComponentUpdater');

let mainWindow = null;
let trayController = null;
let isExpanded = true; // Start expanded so user immediately sees the UI

const COLLAPSED_THICKNESS = 18;
const EXPANDED_WIDTH = 380;   // Used for left/right dock
const EXPANDED_HEIGHT = 520;  // Used for top dock (needs to fit tall detail cards)
const UI_LENGTH = 680;        // The long dimension (height for left/right, width for top)

function calculateBounds(expanded, customLength = UI_LENGTH) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const dockSide = store.get('dockSide') || 'right';

  let x, y, width, height;

  if (dockSide === 'top') {
    height = expanded ? EXPANDED_HEIGHT : COLLAPSED_THICKNESS;
    width = customLength;
    
    const savedX = store.get('dragOffsetTop');
    if (savedX !== undefined) {
      x = savedX;
    } else {
      x = Math.round(workArea.x + (workArea.width - width) / 2);
    }
    y = workArea.y;
  } else if (dockSide === 'left') {
    width = expanded ? EXPANDED_WIDTH : COLLAPSED_THICKNESS;
    height = customLength;
    x = workArea.x;
    
    const savedY = store.get('dragOffsetSide');
    if (savedY !== undefined) {
      y = savedY;
    } else {
      y = Math.round(workArea.y + (workArea.height - height) / 2);
    }
  } else { // right
    width = expanded ? EXPANDED_WIDTH : COLLAPSED_THICKNESS;
    height = customLength;
    x = workArea.x + workArea.width - width;
    
    const savedY = store.get('dragOffsetSide');
    if (savedY !== undefined) {
      y = savedY;
    } else {
      y = Math.round(workArea.y + (workArea.height - height) / 2);
    }
  }

  // Ensure window stays within screen bounds if screen size changed
  if (x < workArea.x) x = workArea.x;
  if (x + width > workArea.x + workArea.width) x = workArea.x + workArea.width - width;
  if (y < workArea.y) y = workArea.y;
  if (y + height > workArea.y + workArea.height) y = workArea.y + workArea.height - height;

  return { x, y, width, height };
}

function createWindow() {
  const bounds = calculateBounds(true);


  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Keep window always on top
  mainWindow.setAlwaysOnTop(true, 'floating');

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  // Removed startup confirmation dialog per user request

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  let isSnapping = false;
  mainWindow.on('moved', () => {
    if (!mainWindow || isSnapping) return;
    const bounds = mainWindow.getBounds();
    const display = screen.getPrimaryDisplay();
    const workArea = display.workArea;

    let dockSide = store.get('dockSide') || 'right';

    // Calculate distance to edges
    const distTop = Math.abs(bounds.y - workArea.y);
    const distLeft = Math.abs(bounds.x - workArea.x);
    const distRight = Math.abs((workArea.x + workArea.width) - (bounds.x + bounds.width));

    // Find the closest edge
    const minDist = Math.min(distTop, distLeft, distRight);

    let newDockSide = dockSide;
    if (minDist === distTop) {
      newDockSide = 'top';
    } else if (minDist === distLeft) {
      newDockSide = 'left';
    } else if (minDist === distRight) {
      newDockSide = 'right';
    }

    if (newDockSide !== dockSide) {
      isSnapping = true;
      store.set('dockSide', newDockSide);
      updateWindowPosition(); 
      if (trayController) trayController.updateContextMenu();
      mainWindow.webContents.send('config-update', store.getAll());
      // Prevent infinite loop if updateWindowPosition triggers moved
      setTimeout(() => { isSnapping = false; }, 500);
    } else {
      // Save custom offset for the current dockSide
      if (dockSide === 'top') {
        store.set('dragOffsetTop', bounds.x);
      } else {
        store.set('dragOffsetSide', bounds.y);
      }
    }
  });

  // Tray setup
  trayController = createTray(
    mainWindow,
    (newSide) => {
      store.set('dockSide', newSide);
      updateWindowPosition();
      mainWindow.webContents.send('config-update', store.getAll());
      if (trayController) trayController.updateContextMenu();
    },
    (newMode) => {
      store.set('countdownMode', newMode);
      mainWindow.webContents.send('config-update', store.getAll());
      if (trayController) trayController.updateContextMenu();
    },
    () => {
      openSettingsWindow();
    }
  );
}

function updateWindowPosition(customLength) {
  if (!mainWindow) return;
  
  let currentLength = customLength;
  if (!currentLength) {
    const dockSide = store.get('dockSide') || 'right';
    const bounds = mainWindow.getBounds();
    currentLength = (dockSide === 'top') ? bounds.width : bounds.height;
    
    // If we are collapsed on top, bounds.width should be 490 (UI_LENGTH), which is correct.
    // If we are collapsed on right/left, bounds.height should be 490, which is correct.
    // But if they somehow get squished, fallback to UI_LENGTH.
    if (currentLength < 100) currentLength = UI_LENGTH;
  }
  
  const bounds = calculateBounds(isExpanded, currentLength);
  mainWindow.setBounds(bounds);
}

// IPC Handlers
ipcMain.handle('get-metrics', async () => {
  return await providerManager.getMetrics();
});

ipcMain.handle('get-config', () => {
  return store.getAll();
});

ipcMain.handle('save-config', async (event, newConfig) => {
  for (const [k, v] of Object.entries(newConfig)) {
    store.set(k, v);
  }
  updateWindowPosition();
  if (trayController) trayController.updateContextMenu();
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('config-update', store.getAll());
    // Immediately push updated metrics so toggling providers is reflected instantly
    const metrics = await providerManager.getMetrics();
    mainWindow.webContents.send('metrics-update', metrics);
  }
  
  return store.getAll();
});

ipcMain.handle('set-expanded', (event, expanded) => {
  if (isExpanded === expanded) return;
  isExpanded = expanded;
  updateWindowPosition();
});

ipcMain.handle('set-window-height', (event, height) => {
  const currentBounds = mainWindow.getBounds();
  if (Math.abs(currentBounds.height - height) > 5) {
    updateWindowPosition(height);
  }
});

function openSettingsWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('open-settings-modal');
  }
}

ipcMain.handle('open-settings', () => {
  openSettingsWindow();
});

ipcMain.handle('quit-app', () => {
  app.isQuitting = true;
  app.quit();
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', async () => {
    // Auto-refresh metrics when user double-clicks the desktop icon again
    const metrics = await providerManager.getMetrics();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('metrics-update', metrics);
    }
    openSettingsWindow();
  });

  app.whenReady().then(() => {
    createWindow();

  console.log('----------------------------------------------------');
  console.log('✓ Pulse 悬浮监视器已在屏幕边缘启动！');
  console.log('  提示：若已吸附在屏幕右侧，初次展示后鼠标移开将收起为呼吸细条。');
  console.log('  可通过任务栏右下角托盘图标快速管理设置与切换停靠侧。');
  console.log('----------------------------------------------------');

  // Polling metrics every 30s

  setInterval(async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const metrics = await providerManager.getMetrics();
      mainWindow.webContents.send('metrics-update', metrics);
    }
  }, 30000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
}

