const {
  app,
  BrowserWindow,
  ipcMain,
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
let updateWindow;
let updateWindowReady = false;
let updateDialogStatus;
let updatesConfigured = false;
let updateCheckInProgress = false;
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

function configureWindowControls() {
  ipcMain.on('fenrid-window-control', (event, action) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (
      !window ||
      (window !== mainWindow && window !== updateWindow) ||
      (window === mainWindow && !isFenridUrl(event.sender.getURL()))
    ) {
      return;
    }

    if (action === 'minimize') {
      window.minimize();
    } else if (action === 'toggle-maximize') {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    } else if (action === 'close') {
      window.close();
    }
  });

  ipcMain.handle('fenrid-window-is-maximized', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (
      !window ||
      (window !== mainWindow && window !== updateWindow) ||
      (window === mainWindow && !isFenridUrl(event.sender.getURL()))
    ) {
      return false;
    }

    return window.isMaximized();
  });
}

function trackWindowMaximizedState(window) {
  const notifyRenderer = () => {
    if (!window.isDestroyed()) {
      window.webContents.send('fenrid-window-maximized', window.isMaximized());
    }
  };

  window.on('maximize', notifyRenderer);
  window.on('unmaximize', notifyRenderer);
  window.webContents.on('did-finish-load', notifyRenderer);
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

function showUpdateStatus(status) {
  updateDialogStatus = status;
  if (!updateWindow || updateWindow.isDestroyed()) {
    return;
  }

  if (!updateWindowReady) {
    return;
  }

  void updateWindow.webContents
    .executeJavaScript(`window.updateStatus(${JSON.stringify(status)})`)
    .catch((error) => {
      console.error('Could not update the Fenrid updater window:', error);
    });
}

function createUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus();
    return;
  }

  const logo = fs
    .readFileSync(path.join(__dirname, '..', 'assets', 'fenrid-logo.png'))
    .toString('base64');
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
    <title>Fenrid - Updates</title>
    <style>
      :root { color-scheme: dark; font-family: "Segoe UI", sans-serif; background: #3149c4; color: #f3f5ff; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 66px 28px 28px; background: #3149c4; }
      #fenrid-desktop-titlebar { position: fixed; z-index: 10; inset: 0 0 auto; height: 38px; display: flex; align-items: center; gap: 9px; padding-left: 14px; background: #3149c4; color: #fff; font: 600 13px "Segoe UI", sans-serif; -webkit-app-region: drag; user-select: none; }
      #fenrid-desktop-titlebar img { width: 22px !important; height: 22px !important; max-width: 22px; max-height: 22px; border-radius: 6px; }
      .fenrid-titlebar-controls { height: 38px; display: flex; margin-left: auto; -webkit-app-region: no-drag; }
      .fenrid-titlebar-controls button { width: 46px; min-width: 0; height: 38px; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; color: #fff; font: 16px "Segoe UI", sans-serif; }
      .fenrid-titlebar-controls button:hover { background: rgba(255,255,255,.16); }
      .fenrid-titlebar-controls button:last-child:hover { background: #c42b1c; }
      .fenrid-titlebar-controls button:focus-visible { outline: 2px solid #fff; outline-offset: -3px; }
      main { width: 100%; max-width: 348px; min-height: 340px; padding: 40px 32px 32px; border-radius: 12px; background: #191b22; box-shadow: 0 16px 38px rgba(13, 19, 51, .3); display: flex; flex-direction: column; align-items: center; text-align: center; }
      img { display: block; width: 48px !important; height: 48px !important; max-width: 48px; max-height: 48px; object-fit: contain; }
      h1 { margin: 18px 0 9px; font-size: 22px; font-weight: 650; letter-spacing: -.3px; }
      p { min-height: 42px; margin: 0; color: #b6bbcb; font-size: 14px; line-height: 1.55; }
      #dots { display: inline-block; min-width: 1.5em; text-align: left; }
      button { min-width: 116px; margin-top: auto; padding: 11px 20px; border: 0; border-radius: 8px; background: #4059f5; color: white; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
      button:hover { background: #5069ff; }
      button:focus-visible { outline: 2px solid #dfe5ff; outline-offset: 3px; }
      [hidden] { display: none !important; }
    </style>
  </head>
  <body>
    <main>
      <img src="data:image/png;base64,${logo}" alt="Fenrid logo" width="48" height="48" style="width:48px;height:48px;max-width:48px;max-height:48px">
      <h1 id="heading">Fenrid</h1>
      <p id="message">Checking for updates<span id="dots"></span></p>
      <button id="close" type="button" hidden>Close</button>
    </main>
    <script>
      (() => {
        const titleBar = document.createElement('header');
        titleBar.id = 'fenrid-desktop-titlebar';
        titleBar.setAttribute('aria-label', 'Fenrid window title bar');
        titleBar.innerHTML = '<img src="data:image/png;base64,${logo}" alt=""><span>Fenrid</span><div class="fenrid-titlebar-controls"><button type="button" data-window-action="minimize" aria-label="Minimize" title="Minimize">−</button><button type="button" data-window-action="toggle-maximize" aria-label="Maximize" title="Maximize">□</button><button type="button" data-window-action="close" aria-label="Close" title="Close">×</button></div>';
        document.body.appendChild(titleBar);
        const maximizeButton = titleBar.querySelector('[data-window-action="toggle-maximize"]');
        titleBar.querySelectorAll('[data-window-action]').forEach((button) => {
          button.addEventListener('click', () => {
            window.fenridWindowControls[button.dataset.windowAction]();
          });
        });
        window.fenridWindowControls.getMaximized().then((isMaximized) => {
          maximizeButton.textContent = isMaximized ? '❐' : '□';
          maximizeButton.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
          maximizeButton.title = isMaximized ? 'Restore' : 'Maximize';
        });
        window.fenridWindowControls.onMaximizedChange((isMaximized) => {
          maximizeButton.textContent = isMaximized ? '❐' : '□';
          maximizeButton.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
          maximizeButton.title = isMaximized ? 'Restore' : 'Maximize';
        });

        const heading = document.getElementById('heading');
        const message = document.getElementById('message');
        const close = document.getElementById('close');
        let dotCount = 0;
        let dotTimer = null;
        const animateDots = () => {
          dotCount = (dotCount + 1) % 4;
          const dots = document.getElementById('dots');
          if (dots) dots.textContent = '.'.repeat(dotCount);
        };

        window.updateStatus = (status) => {
          if (status.state === 'checking') {
            heading.textContent = 'Fenrid';
            message.replaceChildren(
              document.createTextNode(status.message || 'Checking for updates'),
            );
            const dots = document.createElement('span');
            dots.id = 'dots';
            dots.setAttribute('aria-hidden', 'true');
            message.append(dots);
            close.hidden = true;
            if (!dotTimer) {
              dotTimer = setInterval(animateDots, 400);
            }
            return;
          }

          clearInterval(dotTimer);
          dotTimer = null;
          const dots = document.getElementById('dots');
          if (dots) dots.remove();
          heading.textContent = status.heading;
          message.textContent = status.message;
          close.hidden = !status.canClose;
        };

        close.addEventListener('click', () => window.close());
      })();
    </script>
  </body>
</html>`;

  const popup = new BrowserWindow({
    width: 420,
    height: 460,
    title: 'Fenrid - Updates',
    icon: path.join(__dirname, '..', 'assets', 'fenrid.ico'),
    backgroundColor: '#3149c4',
    autoHideMenuBar: true,
    frame: false,
    resizable: true,
    maximizable: true,
    minimizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  updateWindow = popup;
  updateWindowReady = false;
  trackWindowMaximizedState(popup);

  updateDialogStatus = {
    state: 'checking',
    message: 'Checking for updates',
  };
  popup.webContents.once('did-finish-load', () => {
    if (updateWindow !== popup || popup.isDestroyed()) {
      return;
    }

    updateWindowReady = true;
    if (updateDialogStatus) {
      showUpdateStatus(updateDialogStatus);
    }
  });
  popup.on('closed', () => {
    if (updateWindow === popup) {
      updateWindow = null;
      updateWindowReady = false;
      updateDialogStatus = undefined;
    }
  });

  void popup.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(
    (error) => {
      console.error('Could not open the Fenrid updater window:', error);
      if (updateWindow === popup && !popup.isDestroyed()) {
        popup.close();
      }
    },
  );
}

function showAcknowledgements() {
  const options = {
    type: 'info',
    title: 'Fenrid - Acknowledgements',
    message: 'Fenrid',
    detail:
      'Built with Electron, Chromium, and electron-updater.\n\nFenrid and the Fenrid logo are the property of their respective owner.',
    buttons: ['Close'],
    noLink: true,
  };
  const prompt =
    mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()
      ? dialog.showMessageBox(mainWindow, options)
      : dialog.showMessageBox(options);

  void prompt.catch((error) => {
    console.error('Could not show Fenrid acknowledgements:', error);
  });
}

async function checkForUpdates(showWindow) {
  const previousStatus = updateDialogStatus;
  if (showWindow) {
    createUpdateWindow();
  }

  if (!updatesConfigured) {
    if (showWindow) {
      showUpdateStatus({
        state: 'idle',
        heading: 'Updates unavailable',
        message:
          'Automatic updates are not configured for this installation yet.',
        canClose: true,
      });
    }
    return;
  }

  if (updateCheckInProgress) {
    if (showWindow) {
      showUpdateStatus(
        previousStatus || {
          state: 'checking',
          message: 'Checking for updates',
        },
      );
    }
    return;
  }

  updateCheckInProgress = true;
  showUpdateStatus({
    state: 'checking',
    message: 'Checking for updates',
  });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    updateCheckInProgress = false;
    console.error('Could not check for Fenrid updates:', error);
    showUpdateStatus({
      state: 'error',
      heading: 'Update check failed',
      message: 'Please check your internet connection and try again.',
      canClose: true,
    });
  }
}

function createTray() {
  tray = new Tray(path.join(__dirname, '..', 'assets', 'fenrid.ico'));
  tray.setToolTip('Fenrid');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Fenrid',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Check for Updates...',
        click: () => {
          void checkForUpdates(true);
        },
      },
      { label: 'Acknowledgements', click: showAcknowledgements },
      { type: 'separator' },
      {
        label: 'Quit Fenrid',
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

  updatesConfigured = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (error) => {
    updateCheckInProgress = false;
    console.error('Fenrid automatic update failed:', error);
    showUpdateStatus({
      state: 'error',
      heading: 'Update check failed',
      message: 'Please check your internet connection and try again.',
      canClose: true,
    });
  });
  autoUpdater.on('update-available', (info) => {
    console.info(`Fenrid update ${info.version} is downloading.`);
    showUpdateStatus({
      state: 'downloading',
      heading: 'Update found',
      message: `Downloading Fenrid ${info.version}.`,
      canClose: false,
    });
  });
  autoUpdater.on('update-not-available', () => {
    updateCheckInProgress = false;
    showUpdateStatus({
      state: 'current',
      heading: "You're up to date",
      message: 'You have the latest version of Fenrid.',
      canClose: true,
    });
  });
  autoUpdater.on('download-progress', (progress) => {
    showUpdateStatus({
      state: 'downloading',
      heading: 'Update found',
      message: `Downloading update: ${Math.round(progress.percent)}%.`,
      canClose: false,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.info(`Fenrid update ${info.version} downloaded; restarting to install it.`);
    updateCheckInProgress = false;
    showUpdateStatus({
      state: 'ready',
      heading: 'Update ready',
      message: 'Fenrid will restart to finish updating.',
      canClose: false,
    });
    setTimeout(() => {
      isQuitting = true;
      autoUpdater.quitAndInstall(true, true);
    }, 1200);
  });

  setTimeout(() => {
    void checkForUpdates(false);
  }, UPDATE_CHECK_DELAY_MS);
}

function addFenridTitleBar(window) {
  let titleBarCss;
  const logo = `data:image/png;base64,${fs
    .readFileSync(path.join(__dirname, '..', 'assets', 'fenrid-logo.png'))
    .toString('base64')}`;

  const installTitleBar = async () => {
    if (window.isDestroyed() || !isFenridUrl(window.webContents.getURL())) {
      return;
    }

    try {
      if (titleBarCss) {
        await window.webContents.removeInsertedCSS(titleBarCss);
      }

      titleBarCss = await window.webContents.insertCSS(`
        *,
        *::before,
        *::after {
          scrollbar-width: none !important;
        }
        *::-webkit-scrollbar,
        *::-webkit-scrollbar-corner {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }
        html, body {
          width: 100% !important;
          height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
        #fenrid-desktop-content {
          position: fixed !important;
          inset: 38px 0 0 !important;
          width: auto !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: hidden !important;
          transform: translateZ(0) !important;
          isolation: isolate !important;
          z-index: 0 !important;
        }
        [data-fenrid-desktop-app-root] {
          position: absolute !important;
          inset: 0 !important;
          box-sizing: border-box !important;
          width: auto !important;
          height: auto !important;
          min-width: 0 !important;
          min-height: 0 !important;
          max-width: 100% !important;
          max-height: 100% !important;
          overflow: hidden !important;
          isolation: isolate !important;
          z-index: 0 !important;
        }
        #fenrid-desktop-titlebar {
          position: fixed;
          z-index: 2147483647;
          inset: 0 0 auto;
          height: 38px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding-left: 14px;
          background: #3149c4;
          color: #fff;
          font: 600 13px "Segoe UI", sans-serif;
          -webkit-app-region: drag;
          user-select: none;
        }
        #fenrid-desktop-titlebar img {
          width: 22px !important;
          height: 22px !important;
          max-width: 22px;
          max-height: 22px;
          border-radius: 6px;
        }
        .fenrid-titlebar-controls {
          height: 38px;
          display: flex;
          margin-left: auto;
          -webkit-app-region: no-drag;
        }
        .fenrid-titlebar-controls button {
          width: 46px;
          min-width: 0;
          height: 38px;
          margin: 0;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: #fff;
          font: 16px "Segoe UI", sans-serif;
        }
        .fenrid-titlebar-controls button:hover { background: rgba(255,255,255,.16); }
        .fenrid-titlebar-controls button:last-child:hover { background: #c42b1c; }
        .fenrid-titlebar-controls button:focus-visible { outline: 2px solid #fff; outline-offset: -3px; }
      `);

      await window.webContents.executeJavaScript(`
        (() => {
          if (!document.body) return;
          let titleBar = document.getElementById('fenrid-desktop-titlebar');
          if (!titleBar) {
            titleBar = document.createElement('div');
            titleBar.id = 'fenrid-desktop-titlebar';
            titleBar.setAttribute('aria-label', 'Fenrid window title bar');
            titleBar.innerHTML = '<img src="${logo}" alt=""><span>Fenrid</span><div class="fenrid-titlebar-controls"><button type="button" data-window-action="minimize" aria-label="Minimize" title="Minimize">−</button><button type="button" data-window-action="toggleMaximize" aria-label="Maximize" title="Maximize">□</button><button type="button" data-window-action="close" aria-label="Close" title="Close">×</button></div>';
          }

          let content = document.getElementById('fenrid-desktop-content');
          if (!content) {
            content = document.createElement('div');
            content.id = 'fenrid-desktop-content';
            const appRoot = document.querySelector('#root, #__next, [data-reactroot]') ||
              Array.from(document.body.children).find((element) => element.tagName === 'DIV');
            if (appRoot) appRoot.setAttribute('data-fenrid-desktop-app-root', '');
            for (const node of Array.from(document.body.childNodes)) {
              if (node !== titleBar) content.appendChild(node);
            }
            document.body.appendChild(content);
          } else {
            for (const node of Array.from(document.body.childNodes)) {
              if (node !== content && node !== titleBar) content.appendChild(node);
            }
          }

          if (!window.fenridDesktopContentObserver) {
            window.fenridDesktopContentObserver = new MutationObserver(() => {
              for (const node of Array.from(document.body.childNodes)) {
                if (node !== content && node !== titleBar) content.appendChild(node);
              }
            });
            window.fenridDesktopContentObserver.observe(document.body, { childList: true });
          }
          if (titleBar.parentElement !== document.body) document.body.appendChild(titleBar);

          if (titleBar.dataset.controlsInstalled) return;
          titleBar.dataset.controlsInstalled = 'true';
          const maximizeButton = titleBar.querySelector('[data-window-action="toggleMaximize"]');
          titleBar.querySelectorAll('[data-window-action]').forEach((button) => {
            button.addEventListener('click', () => {
              window.fenridWindowControls[button.dataset.windowAction]();
            });
          });
          window.fenridWindowControls.getMaximized().then((isMaximized) => {
            maximizeButton.textContent = isMaximized ? '❐' : '□';
            maximizeButton.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
            maximizeButton.title = isMaximized ? 'Restore' : 'Maximize';
          });
          window.fenridWindowControls.onMaximizedChange((isMaximized) => {
            maximizeButton.textContent = isMaximized ? '❐' : '□';
            maximizeButton.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
            maximizeButton.title = isMaximized ? 'Restore' : 'Maximize';
          });
        })();
      `);
    } catch (error) {
      console.error('Could not install the Fenrid window title bar:', error);
    }
  };

  window.webContents.on('did-finish-load', () => {
    void installTitleBar();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Fenrid',
    icon: path.join(__dirname, '..', 'assets', 'fenrid.ico'),
    backgroundColor: '#0f0f14',
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  trackWindowMaximizedState(mainWindow);

  mainWindow.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle('Fenrid');
  });

  addFenridTitleBar(mainWindow);

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
  configureWindowControls();
  configurePermissions();
  createTray();
  configureAutoUpdates();
  createWindow();

  if (process.argv.includes('--check-for-updates')) {
    void checkForUpdates(true);
  }

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
