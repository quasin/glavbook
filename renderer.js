const { ipcRenderer } = require('electron');

const tabsContainer = document.getElementById('tabs-container');
const webviewContainer = document.getElementById('webview-container');
const urlInput = document.getElementById('url-input');
const proxyInput = document.getElementById('proxy-input');

const HOME_URL = 'https://www.google.com';
let tabs = [];
let activeTabId = null;

ipcRenderer.on('open-new-tab', (event, url) => {
  createTab(url);
});

function createTab(url = HOME_URL) {
  const tabId = 'tab-' + Date.now();

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.id = `header-${tabId}`;
  tabEl.innerHTML = `
    <span class="tab-title">New Tab</span>
    <span class="close-btn">&times;</span>
  `;

  const webview = document.createElement('webview');
  webview.id = `view-${tabId}`;
  webview.setAttribute('allowpopups', 'true');
  // Isolated in-memory session partition per tab
  webview.setAttribute('partition', tabId);
  webview.src = url;

  webview.addEventListener('page-title-updated', (e) => {
    tabEl.querySelector('.tab-title').textContent = e.title || 'Untitled';
  });

  webview.addEventListener('did-navigate', (e) => {
    if (activeTabId === tabId) {
      urlInput.value = e.url;
    }
  });

  webview.addEventListener('did-navigate-in-page', (e) => {
    if (activeTabId === tabId && e.url) {
      urlInput.value = e.url;
    }
  });

  tabEl.addEventListener('click', (e) => {
    if (!e.target.classList.contains('close-btn')) {
      setActiveTab(tabId);
    }
  });

  tabEl.querySelector('.close-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(tabId);
  });

  tabsContainer.appendChild(tabEl);
  webviewContainer.appendChild(webview);

  tabs.push({ id: tabId, tabEl, webview, proxy: '' });
  setActiveTab(tabId);
}

function setActiveTab(tabId) {
  activeTabId = tabId;
  const currentTab = tabs.find(t => t.id === tabId);

  tabs.forEach(tab => {
    const isActive = tab.id === tabId;
    tab.tabEl.classList.toggle('active', isActive);
    tab.webview.classList.toggle('active', isActive);
  });

  if (currentTab) {
    urlInput.value = currentTab.webview.getURL() || '';
    proxyInput.value = currentTab.proxy || '';
  }
}

function closeTab(tabId) {
  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;

  if (tabs[index].proxy) {
    ipcRenderer.invoke('release-proxy-credentials', tabs[index].proxy);
  }

  tabs[index].tabEl.remove();
  tabs[index].webview.remove();
  tabs.splice(index, 1);

  if (tabs.length === 0) {
    createTab();
  } else if (activeTabId === tabId) {
    const newActiveIndex = Math.max(0, index - 1);
    setActiveTab(tabs[newActiveIndex].id);
  }
}

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId);
}

function navigateTo(inputUrl) {
  const activeTab = getActiveTab();
  if (!activeTab || !activeTab.webview) return;

  let finalUrl = inputUrl.trim();
  if (!/^https?:\/\//i.test(finalUrl)) {
    finalUrl = finalUrl.includes('.') 
      ? `https://${finalUrl}` 
      : `https://www.google.com/search?q=${encodeURI(finalUrl)}`;
  }
  activeTab.webview.loadURL(finalUrl);
}

async function applyProxy() {
  const activeTab = getActiveTab();
  if (!activeTab) return;

  const newProxy = proxyInput.value.trim();
  const oldProxy = activeTab.proxy;

  if (newProxy === oldProxy) return;

  const ok = await ipcRenderer.invoke('set-tab-proxy', {
    partition: activeTab.id,
    proxyRules: newProxy
  });

  if (!ok) {
    proxyInput.classList.add('invalid');
    setTimeout(() => proxyInput.classList.remove('invalid'), 1500);
    return;
  }

  if (oldProxy) {
    await ipcRenderer.invoke('release-proxy-credentials', oldProxy);
  }

  activeTab.proxy = newProxy;
  activeTab.webview.reload();
}

// Navigation Controls
document.getElementById('btn-new-tab').addEventListener('click', () => createTab());

document.getElementById('btn-back').addEventListener('click', () => {
  const tab = getActiveTab();
  if (tab?.webview && tab.webview.canGoBack()) tab.webview.goBack();
});

document.getElementById('btn-forward').addEventListener('click', () => {
  const tab = getActiveTab();
  if (tab?.webview && tab.webview.canGoForward()) tab.webview.goForward();
});

document.getElementById('btn-reload').addEventListener('click', () => {
  const tab = getActiveTab();
  if (tab?.webview) tab.webview.reload();
});

document.getElementById('btn-home').addEventListener('click', () => navigateTo(HOME_URL));
document.getElementById('btn-go').addEventListener('click', () => navigateTo(urlInput.value));

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') navigateTo(urlInput.value);
});

// Proxy Controls
document.getElementById('btn-proxy').addEventListener('click', applyProxy);
proxyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyProxy();
});

// Initial tab on startup
createTab();
