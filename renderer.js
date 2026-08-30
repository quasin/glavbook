const { ipcRenderer } = require('electron');

const tabsContainer = document.getElementById('tabs-container');
const webviewContainer = document.getElementById('webview-container');
const urlInput = document.getElementById('url-input');

const HOME_URL = 'https://www.google.com';
let tabs = [];
let activeTabId = null;

// Слушаем сообщение от main.js об открытии ссылки в новой вкладке
ipcRenderer.on('open-new-tab', (event, url) => {
  createTab(url);
});

function createTab(url = HOME_URL) {
  const tabId = 'tab-' + Date.now();

  // Создаем заголовок вкладки
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.id = `header-${tabId}`;
  tabEl.innerHTML = `
    <span class="tab-title">New Tab</span>
    <span class="close-btn">&times;</span>
  `;

  // Создаем webview
  const webview = document.createElement('webview');
  webview.id = `view-${tabId}`;
  webview.setAttribute('allowpopups', 'true'); // Разрешаем всплывающие окна для работы обработчика
  webview.src = url;

  // Обновление заголовка вкладки при загрузке страницы
  webview.addEventListener('page-title-updated', (e) => {
    tabEl.querySelector('.tab-title').textContent = e.title || 'Untitled';
  });

  // Обновление адресной строки при навигации
  webview.addEventListener('did-navigate', (e) => {
    if (activeTabId === tabId) {
      urlInput.value = e.url;
    }
  });

  // Клик по вкладке
  tabEl.addEventListener('click', (e) => {
    if (!e.target.classList.contains('close-btn')) {
      setActiveTab(tabId);
    }
  });

  // Закрытие вкладки
  tabEl.querySelector('.close-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(tabId);
  });

  tabsContainer.appendChild(tabEl);
  webviewContainer.appendChild(webview);

  tabs.push({ id: tabId, tabEl, webview });
  setActiveTab(tabId);
}

function setActiveTab(tabId) {
  activeTabId = tabId;
  tabs.forEach(tab => {
    const isActive = tab.id === tabId;
    tab.tabEl.classList.toggle('active', isActive);
    tab.webview.classList.toggle('active', isActive);
    if (isActive) {
      urlInput.value = tab.webview.getURL() || '';
    }
  });
}

function closeTab(tabId) {
  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;

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

function getActiveWebview() {
  const current = tabs.find(t => t.id === activeTabId);
  return current ? current.webview : null;
}

function navigateTo(inputUrl) {
  const webview = getActiveWebview();
  if (!webview) return;

  let finalUrl = inputUrl.trim();
  if (!/^https?:\/\//i.test(finalUrl)) {
    finalUrl = finalUrl.includes('.') 
      ? `https://${finalUrl}` 
      : `https://www.google.com/search?q=${encodeURI(finalUrl)}`;
  }
  webview.loadURL(finalUrl);
}

// Кнопки управления
document.getElementById('btn-new-tab').addEventListener('click', () => createTab());

document.getElementById('btn-back').addEventListener('click', () => {
  const wv = getActiveWebview();
  if (wv && wv.canGoBack()) wv.goBack();
});

document.getElementById('btn-forward').addEventListener('click', () => {
  const wv = getActiveWebview();
  if (wv && wv.canGoForward()) wv.goForward();
});

document.getElementById('btn-reload').addEventListener('click', () => {
  const wv = getActiveWebview();
  if (wv) wv.reload();
});

document.getElementById('btn-home').addEventListener('click', () => navigateTo(HOME_URL));
document.getElementById('btn-go').addEventListener('click', () => navigateTo(urlInput.value));

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') navigateTo(urlInput.value);
});

// Открываем первую вкладку при старте
createTab();
