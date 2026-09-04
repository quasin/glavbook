const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  Graphics: {
    resolution_width: '1280',
    resolution_height: '720',
    fullscreen: 'false'
  },
  Audio: {
    mute: 'false'
  }
};

let win;
let settingsPath = null;
// Stores proxy credentials mapped by host:port, with reference counts
const proxyAuthMap = new Map();

function getSettingsPath() {
  if (!settingsPath) {
    settingsPath = path.join(app.getPath('userData'), 'settings.ini');
  }
  return settingsPath;
}

function parseIni(text) {
  const data = {};
  let section = '';
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!section || !key) continue;
    if (!data[section]) data[section] = {};
    data[section][key] = value;
  }
  return data;
}

function serializeIni(data) {
  return Object.entries(data)
    .map(([section, values]) => {
      const lines = Object.entries(values).map(([key, value]) => `${key} = ${value}`);
      return `[${section}]\n${lines.join('\n')}`;
    })
    .join('\n\n') + '\n';
}

function mergeSettings(data) {
  const merged = {};
  for (const [section, defaults] of Object.entries(DEFAULT_SETTINGS)) {
    merged[section] = { ...defaults, ...(data[section] || {}) };
  }
  for (const [section, values] of Object.entries(data)) {
    if (!merged[section]) merged[section] = { ...values };
  }
  return merged;
}

function loadSettings() {
  const file = getSettingsPath();
  try {
    if (fs.existsSync(file)) {
      return mergeSettings(parseIni(fs.readFileSync(file, 'utf8')));
    }
  } catch (err) {
    console.error('Failed to read settings.ini:', err);
  }
  const settings = mergeSettings({});
  saveSettings(settings);
  return settings;
}

function saveSettings(data) {
  const file = getSettingsPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, serializeIni(data), 'utf8');
  } catch (err) {
    console.error('Failed to write settings.ini:', err);
  }
}

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

// [Audio]: mute=true hard-mutes every attached webview
function isAudioMuted() {
  const audio = loadSettings().Audio || {};
  return String(audio.mute).toLowerCase() === 'true';
}

function createWindow() {
  const graphics = loadSettings().Graphics || {};
  win = new BrowserWindow({
    width: parseInt(graphics.resolution_width, 10) || 1200,
    height: parseInt(graphics.resolution_height, 10) || 800,
    fullscreen: String(graphics.fullscreen).toLowerCase() === 'true',
    webPreferences: {
      webviewTag: true,
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');

  // Intercept window.open / target="_blank", and apply mute settings to each tab
  win.webContents.on('did-attach-webview', (event, webContents) => {
    webContents.setAudioMuted(isAudioMuted());
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

// Load the whole settings object from settings.ini
ipcMain.handle('load-settings', () => loadSettings());

// Persist the open-tab list (slot + URL) so tabs and their cookies restore on launch
ipcMain.handle('save-session', (event, payload) => {
  const open = Array.isArray(payload?.tabs) ? payload.tabs : [];
  const settings = loadSettings();
  const sess = {
    ever_created: String(parseInt(payload?.everCreated, 10) || 0),
    open_count: String(open.length)
  };
  open.forEach((t, i) => {
    sess['slot_' + (i + 1)] = String(t.slot || 0);
    sess['url_' + (i + 1)] = String(t.url || '');
    sess['proxy_' + (i + 1)] = String(t.proxy || '');
  });
  settings.Session = sess;
  saveSettings(settings);
  return true;
});

// Remove persisted partitions that belong to no open tab (closed tabs lose their data by design)
function pruneOrphanPartitions(openSlots) {
  try {
    const dir = path.join(app.getPath('userData'), 'Partitions');
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const match = name.match(/^slot-(\d+)$/);
      if (match && !openSlots.has(Number(match[1]))) {
        fs.rmSync(path.join(dir, name), { recursive: true, force: true });
      }
    }
  } catch (err) {
    console.error('Failed to prune partitions:', err);
  }
}

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
  const settingsFile = getSettingsPath();
  const hadSettings = fs.existsSync(settingsFile);
  const settings = loadSettings();

  if (hadSettings) {
    const sess = settings.Session || {};
    const openCount = parseInt(sess.open_count, 10) || 0;
    if (openCount > 0) {
      const openSlots = new Set();
      for (let i = 1; i <= openCount; i++) {
        const slot = parseInt(sess['slot_' + i], 10);
        if (slot) openSlots.add(slot);
      }
      pruneOrphanPartitions(openSlots);
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
