const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

let win;
// Stores proxy credentials mapped by host:port
const proxyAuthMap = new Map();

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      webviewTag: true,
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');

  // Intercept window.open / target="_blank"
  win.webContents.on('did-attach-webview', (event, webContents) => {
    webContents.setWindowOpenHandler((details) => {
      win.webContents.send('open-new-tab', details.url);
      return { action: 'deny' };
    });
  });
}

// Handle HTTP Proxy authentication
app.on('login', (event, webContents, request, authInfo, callback) => {
  if (authInfo.isProxy) {
    const key = `${authInfo.host}:${authInfo.port}`;
    const credentials = proxyAuthMap.get(key);

    if (credentials) {
      event.preventDefault();
      callback(credentials.username, credentials.password);
      return;
    }
  }
});

// Handle per-tab proxy updates
ipcMain.handle('set-tab-proxy', async (event, { partition, proxyRules }) => {
  const ses = session.fromPartition(partition);

  if (!proxyRules || proxyRules.trim() === '') {
    await ses.setProxy({ mode: 'direct' });
    return true;
  }

  let formatted = proxyRules.trim();
  if (!/^https?:\/\//i.test(formatted)) {
    formatted = `http://${formatted}`;
  }

  try {
    const parsed = new URL(formatted);

    // Extract credentials if present
    if (parsed.username || parsed.password) {
      const port = parsed.port || '80';
      const key = `${parsed.hostname}:${port}`;

      proxyAuthMap.set(key, {
        username: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password)
      });

      // Pass only protocol://host:port to Chromium
      const cleanProxy = `${parsed.protocol}//${parsed.hostname}:${port}`;
      await ses.setProxy({ proxyRules: cleanProxy });
    } else {
      await ses.setProxy({ proxyRules: formatted });
    }
  } catch (err) {
    console.error('Failed to parse proxy URL:', err);
  }

  return true;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
