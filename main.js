const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

let win;
// Stores proxy credentials mapped by host:port, with reference counts
const proxyAuthMap = new Map();

function normalizeProxyUrl(proxyRules) {
  let formatted = proxyRules.trim();
  if (!/^https?:\/\//i.test(formatted)) {
    formatted = `http://${formatted}`;
  }
  return new URL(formatted);
}

function defaultPortFor(protocol) {
  return protocol === 'https:' ? '443' : '80';
}

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
    const parsed = normalizeProxyUrl(proxyRules);
    const port = parsed.port || defaultPortFor(parsed.protocol);
    const key = `${parsed.hostname}:${port}`;

    if (parsed.username || parsed.password) {
      const entry = proxyAuthMap.get(key);
      if (entry) {
        entry.refs += 1;
      } else {
        proxyAuthMap.set(key, {
          username: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password),
          refs: 1
        });
      }
    }

    // Pass only protocol://host:port to Chromium
    await ses.setProxy({ proxyRules: `${parsed.protocol}//${parsed.hostname}:${port}` });
    return true;
  } catch (err) {
    console.error('Failed to parse proxy URL:', err);
    return false;
  }
});

// Drop credential references when a tab changes or closes
ipcMain.handle('release-proxy-credentials', (event, proxyRules) => {
  if (!proxyRules || proxyRules.trim() === '') return;

  try {
    const parsed = normalizeProxyUrl(proxyRules);
    if (!parsed.username && !parsed.password) return;

    const port = parsed.port || defaultPortFor(parsed.protocol);
    const key = `${parsed.hostname}:${port}`;
    const entry = proxyAuthMap.get(key);

    if (entry && --entry.refs <= 0) {
      proxyAuthMap.delete(key);
    }
  } catch (err) {
    console.error('Failed to parse proxy URL:', err);
  }
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
