const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('parBrowser', {
  getHistory: () => ipcRenderer.invoke('history:get'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  open: (url, allowCustomHost) => ipcRenderer.invoke('par:open', url, allowCustomHost),
  close: () => ipcRenderer.invoke('par:close'),
  inspect: () => ipcRenderer.invoke('par:inspect'),
  refresh: () => ipcRenderer.invoke('par:refresh'),
  showRaw: () => ipcRenderer.invoke('par:showRaw'),
  chooseUpload: () => ipcRenderer.invoke('par:chooseUpload'),
  uploadDropped: (file) => file.arrayBuffer().then((bytes) => ipcRenderer.invoke('par:uploadDropped', file.name, file.type, bytes)),
  downloadObject: (name) => ipcRenderer.invoke('par:downloadObject', name),
  createFolder: (name) => ipcRenderer.invoke('par:createFolder', name)
});
