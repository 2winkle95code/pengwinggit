const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('octogit', {
  openRepo: (path) => ipcRenderer.invoke('open-repo', path),
  getLog: (opts) => ipcRenderer.invoke('get-log', opts),
  getBranches: () => ipcRenderer.invoke('get-branches'),
  getTags: () => ipcRenderer.invoke('get-tags'),
  getStashes: () => ipcRenderer.invoke('get-stashes'),
  getCommitDetail: (hash) =>
    ipcRenderer.invoke('get-commit-detail', hash),
  getDiff: (hash) => ipcRenderer.invoke('get-diff', hash),
  getFileDiff: (hash, path) =>
    ipcRenderer.invoke('get-file-diff', hash, path),
  getStatus: () => ipcRenderer.invoke('get-status'),
  getRemotes: () => ipcRenderer.invoke('get-remotes'),
  checkoutBranch: (b) => ipcRenderer.invoke('checkout-branch', b),
  getFileTree: (hash) => ipcRenderer.invoke('get-file-tree', hash),
  getFileContent: (hash, fp) =>
    ipcRenderer.invoke('get-file-content', hash, fp),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
});
