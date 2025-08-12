// main.js
import { app, BrowserWindow } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { fileURLToPath } from 'url';
import { initialize as initializeRoonService } from './roonService.js';
import { registerIpcHandlers } from './ipcHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store({
  name: 'config',
  defaults: {
    token: null,
    lastZoneId: null,
    filters: { genres: [] }
  }
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 780,
    minHeight: 560,
    title: 'Roon Random Album',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // mainWindow.webContents.once('dom-ready', () => mainWindow.webContents.openDevTools({ mode: 'detach' }));
}

app.whenReady().then(() => {
  createWindow();

  // Initialize our new modules
  initializeRoonService(mainWindow, store);
  registerIpcHandlers(store);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});