const { app, BrowserWindow } = require('electron');
const path = require('path');

let win;

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

  // Перехватываем открытие новых окон/ссылок target="_blank" из <webview>
  win.webContents.on('did-attach-webview', (event, webContents) => {
    webContents.setWindowOpenHandler((details) => {
      // Отправляем URL во фронтенд для создания новой вкладки
      win.webContents.send('open-new-tab', details.url);
      
      // Запрещаем Electron создавать отдельное нативное всплывающее окно
      return { action: 'deny' };
    });
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
