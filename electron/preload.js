/* RenPyDoc Finder — Electron preload：向页面注入更新检测与同步更新桥 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('renpyDocUpdate', {
  check: function () { return ipcRenderer.invoke('rpd:update-check') },
  syncDocs: function (payload) { return ipcRenderer.invoke('rpd:sync-docs', payload) },
  openExternal: function (url) { return ipcRenderer.invoke('rpd:open-external', url) }
})
