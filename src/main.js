const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  shell,
  session,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs');
const path = require('node:path');

const FENRID_URL = 'https://fenrid.com/channels/me';
const FENRID_PERMISSIONS = new Set(['media', 'notifications']);
const UPDATE_CHECK_DELAY_MS = 5000;

let mainWindow;
let tray;
let isQuitting = false;

app.setAppUserModelId('com.fenrid.desktop');

function isFenridUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'fenrid.com';
  } catch {
    return false;
  }
}

function openExternalUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    console.warn('Blocked an invalid external link.');
    return;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    console.warn('Blocked an external link with an unsupported protocol.');
    return;
  }

  void shell.openExternal(url.href).catch((error) => {
    console.error('Could not open the link in the default browser:', error);
  });
}

function canAccessFenridPermission(url, permission) {
  return isFenridUrl(url) && FENRID_PERMISSIONS.has(permission);
}

function configurePermissions() {
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) => {
      const requestUrl = requestingOrigin || (webContents ? webContents.getURL() : '');
      return canAccessFenridPermission(requestUrl, permission);
    },
  );

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const requestingUrl =
        details && details.requestingUrl
          ? details.requestingUrl
          : webContents
            ? webContents.getURL()
            : '';
      callback(canAccessFenridPermission(requestingUrl, permission));
    },
  );
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  tray = new Tray(path.join(__dirname, '..', 'assets', 'fenrid.ico'));
  tray.setToolTip('Fenrid Installer');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Fenrid Installer', click: showWindow },
      { type: 'separator' },
      {
        label: 'Quit Fenrid Installer',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
}

function configureAutoUpdates() {
  const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml');
  if (!app.isPackaged || !fs.existsSync(updateConfigPath)) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (error) => {
    console.error('Fenrid automatic update failed:', error);
  });
  autoUpdater.on('update-available', (info) => {
    console.info(`Fenrid update ${info.version} is downloading.`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.info(`Fenrid update ${info.version} downloaded; restarting to install it.`);
    isQuitting = true;
    autoUpdater.quitAndInstall(true, true);
  });

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((error) => {
      console.error('Could not check for Fenrid updates:', error);
    });
  }, UPDATE_CHECK_DELAY_MS);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Fenrid Installer',
    icon: path.join(__dirname, '..', 'assets', 'fenrid.ico'),
    backgroundColor: '#0f0f14',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle('Fenrid Installer');
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isFenridUrl(url)) {
      return { action: 'allow' };
    }

    openExternalUrl(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isFenridUrl(url)) {
      event.preventDefault();
      openExternalUrl(url);
    }
  });

  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isFenridUrl(url)) {
      event.preventDefault();
      openExternalUrl(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(FENRID_URL).catch((error) => {
    console.error('Could not load Fenrid:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        'Fenrid could not be opened',
        'Check your internet connection and try launching Fenrid again.',
      );
    }
  });
}

app.whenReady().then(() => {
  configurePermissions();
  createTray();
  configureAutoUpdates();
  createWindow();

  app.on('activate', () => {
    showWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'win32') {
    app.quit();
  }
});
