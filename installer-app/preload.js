const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'fenridSetup',
  Object.freeze({
    getDefaultInstallPath: () => ipcRenderer.invoke('setup:get-default-path'),
    chooseInstallPath: () => ipcRenderer.invoke('setup:choose-install-path'),
    install: (installPath) => ipcRenderer.invoke('setup:install', installPath),
    launchFenrid: () => ipcRenderer.invoke('setup:launch'),
    minimize: () => ipcRenderer.send('setup:window-control', 'minimize'),
    close: () => ipcRenderer.send('setup:window-control', 'close'),
    onInstallStatus: (listener) => {
      if (typeof listener !== 'function') {
        throw new TypeError('The install status listener must be a function.');
      }

      const handleStatus = (_event, status) => listener(status);
      ipcRenderer.on('setup:install-status', handleStatus);
      return () => ipcRenderer.removeListener('setup:install-status', handleStatus);
    },
  }),
);
