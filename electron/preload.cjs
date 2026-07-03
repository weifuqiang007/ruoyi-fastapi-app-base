// Electron 预载：桥接桌面能力
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
  // 提醒触发时：强制把窗口从最小化/后台拉到最前（覆盖在其他 app 之上）
  focusReminder: () => ipcRenderer.send('focus-reminder'),
})
