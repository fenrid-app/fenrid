const { contextBridge, ipcRenderer } = require('electron');

const maximizedListeners = new Set();

ipcRenderer.on('fenrid-window-maximized', (_event, isMaximized) => {
  for (const listener of maximizedListeners) {
    listener(isMaximized);
  }
});

contextBridge.exposeInMainWorld(
  'fenridWindowControls',
  Object.freeze({
    minimize: () => ipcRenderer.send('fenrid-window-control', 'minimize'),
    toggleMaximize: () => ipcRenderer.send('fenrid-window-control', 'toggle-maximize'),
    close: () => ipcRenderer.send('fenrid-window-control', 'close'),
    getMaximized: () => ipcRenderer.invoke('fenrid-window-is-maximized'),
    onMaximizedChange: (listener) => {
      if (typeof listener !== 'function') {
        throw new TypeError('The maximize-state listener must be a function.');
      }

      maximizedListeners.add(listener);
      return () => maximizedListeners.delete(listener);
    },
  }),
);
