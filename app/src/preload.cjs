'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', Object.freeze({
  environment: () => ipcRenderer.invoke('environment'),
  saveCharacter: data => ipcRenderer.invoke('save-character', data),
  openCharacter: () => ipcRenderer.invoke('open-character'),
  importTattoo: () => ipcRenderer.invoke('import-tattoo'),
  saveOutput: (kind, bytes, name) => ipcRenderer.invoke('save-output', { kind, bytes, name }),
  startVideo: options => ipcRenderer.invoke('video-start', options),
  videoFrame: bytes => ipcRenderer.invoke('video-frame', bytes),
  finishVideo: () => ipcRenderer.invoke('video-finish'),
  cancelVideo: () => ipcRenderer.invoke('video-cancel'),
  revealOutput: path => ipcRenderer.invoke('reveal-output', path)
}));
