const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nobiDesktop', Object.freeze({
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  isElectron: true
}));
