// Electron 主进程：装载 uni-app H5 构建产物为桌面窗口
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

// 去掉默认菜单栏（更接近应用形态）
Menu.setApplicationMenu(null)

// 提醒触发 → 强制把窗口拉到最前（即便最小化 / 被其他 app 覆盖）
ipcMain.on('focus-reminder', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender) || BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.setAlwaysOnTop(true) // Windows：置顶盖在 Excel/微信之上
  win.focus()
  win.flashFrame(true) // Windows 任务栏闪烁
  // macOS：Dock 图标「关键级」跳动（Mac 系统不允许后台 app 抢焦点，这是上限）
  if (process.platform === 'darwin') {
    try {
      app.dock && app.dock.bounce('critical')
    } catch (err) {}
  }
  // 用户点回窗口后取消置顶 + 停止闪烁
  const off = () => {
    win.setAlwaysOnTop(false)
    win.flashFrame(false)
    win.removeListener('focus', off)
  }
  win.on('focus', off)
})

// 定位 H5 产物 index.html（兼容多种输出目录）
function resolveH5Index() {
  const candidates = [
    path.join(__dirname, '..', 'dist', 'build', 'h5', 'index.html'),
    path.join(__dirname, '..', 'dist', 'h5', 'index.html'),
    path.join(__dirname, '..', 'unpackage', 'dist', 'build', 'h5', 'index.html'),
  ]
  for (const p of candidates) if (fs.existsSync(p)) return p
  return candidates[0]
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: '律师案件管理日历',
    backgroundColor: '#FAFAFA',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false, // 最小化/后台时仍按时触发提醒定时器
    },
  })

  // 外链（如有）在系统浏览器打开，不在应用内导航
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  win.loadFile(resolveH5Index())
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
