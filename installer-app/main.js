const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
} = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let setupWindow;
let installProcess;
let installedDirectory;

app.setAppUserModelId('com.fenrid.desktop.setup');

function getDefaultInstallPath() {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Programs', 'Fenrid');
}

function isSetupSender(event) {
  return setupWindow && event.sender === setupWindow.webContents;
}

function sendInstallStatus(status) {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.webContents.send('setup:install-status', status);
  }
}

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 760,
    height: 560,
    minWidth: 760,
    minHeight: 560,
    maxWidth: 760,
    maxHeight: 560,
    title: 'Fenrid Setup',
    icon: path.join(process.resourcesPath, 'fenrid-logo.png'),
    backgroundColor: '#00000000',
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const installerPageUrl = pathToFileURL(
    path.join(__dirname, 'index.html'),
  ).href;
  setupWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  setupWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== installerPageUrl) {
      event.preventDefault();
    }
  });
  setupWindow.on('close', (event) => {
    if (installProcess) {
      event.preventDefault();
    }
  });
  setupWindow.on('closed', () => {
    setupWindow = null;
  });

  void setupWindow.loadFile(path.join(__dirname, 'index.html')).then(() => {
    const logo = fs
      .readFileSync(path.join(process.resourcesPath, 'fenrid-logo.png'))
      .toString('base64');
    const logoDataUrl = `data:image/png;base64,${logo}`;
    return setupWindow.webContents.executeJavaScript(
      `document.querySelectorAll('#fenrid-logo, .fenrid-card-logo').forEach((image) => { image.src = ${JSON.stringify(logoDataUrl)}; })`,
    );
  }).catch((error) => {
    console.error('Could not open the Fenrid setup window:', error);
    app.quit();
  });
}

ipcMain.handle('setup:get-default-path', (event) => {
  if (!isSetupSender(event)) {
    throw new Error('Rejected a request from an unexpected window.');
  }
  return getDefaultInstallPath();
});

ipcMain.handle('setup:choose-install-path', async (event) => {
  if (!isSetupSender(event)) {
    throw new Error('Rejected a request from an unexpected window.');
  }

  const result = await dialog.showOpenDialog(setupWindow, {
    title: 'Choose where to install Fenrid',
    defaultPath: getDefaultInstallPath(),
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('setup:install', (event, requestedDirectory) => {
  if (!isSetupSender(event)) {
    throw new Error('Rejected a request from an unexpected window.');
  }
  if (installProcess) {
    throw new Error('Fenrid setup is already installing.');
  }
  if (typeof requestedDirectory !== 'string' || !path.isAbsolute(requestedDirectory)) {
    throw new TypeError('Choose a valid absolute installation folder.');
  }

  const destination = path.resolve(requestedDirectory);
  if (path.basename(destination).toLowerCase() !== 'fenrid') {
    throw new TypeError('The install folder must end in Fenrid.');
  }

  const installerPath = path.join(
    process.resourcesPath,
    'fenrid-update-installer.exe',
  );
  if (!fs.existsSync(installerPath)) {
    throw new Error('The Fenrid installation files are missing.');
  }

  installedDirectory = destination;
  sendInstallStatus({ state: 'installing' });

  return new Promise((resolve, reject) => {
    let completed = false;
    const finish = (error) => {
      if (completed) {
        return;
      }
      completed = true;
      installProcess = null;

      if (error) {
        console.error('Fenrid setup could not install the application:', error);
        sendInstallStatus({
          state: 'error',
          message: 'Fenrid could not be installed. Please close Fenrid and try again.',
        });
        reject(error);
        return;
      }

      sendInstallStatus({ state: 'complete' });
      resolve();
    };

    try {
      installProcess = spawn(
        installerPath,
        ['/S', `/D=${destination}`],
        { windowsHide: true },
      );
      installProcess.once('error', finish);
      installProcess.once('close', (code, signal) => {
        if (code === 0) {
          finish();
          return;
        }

        finish(
          new Error(
            `The Fenrid installer exited with code ${code} (signal ${signal || 'none'}).`,
          ),
        );
      });
    } catch (error) {
      finish(error);
    }
  });
});

ipcMain.handle('setup:launch', (event) => {
  if (!isSetupSender(event)) {
    throw new Error('Rejected a request from an unexpected window.');
  }
  if (!installedDirectory) {
    throw new Error('Fenrid has not been installed yet.');
  }

  const executable = path.join(installedDirectory, 'Fenrid.exe');
  if (!fs.existsSync(executable)) {
    throw new Error('The Fenrid application could not be found.');
  }

  const fenridProcess = spawn(executable, [], {
    detached: true,
    stdio: 'ignore',
  });
  fenridProcess.once('error', (error) => {
    console.error('Could not start Fenrid after setup:', error);
  });
  fenridProcess.unref();
});

ipcMain.on('setup:window-control', (event, action) => {
  if (!isSetupSender(event) || installProcess) {
    return;
  }

  if (action === 'minimize') {
    setupWindow.minimize();
  } else if (action === 'close') {
    setupWindow.close();
  }
});

app.whenReady().then(() => {
  createSetupWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
