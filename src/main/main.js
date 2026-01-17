const { app, BrowserWindow, ipcMain, screen } = require('electron');

// Import handler modules
const { registerDatasetHandlers } = require('./handlers/dataset');
const { registerFileHandlers } = require('./handlers/files');
const { registerDownloadHandlers } = require('./handlers/download');
const { registerAnnotationHandlers } = require('./handlers/annotation');
const { registerTrainingHandlers } = require('./handlers/training');
const { registerPredictionHandlers } = require('./handlers/prediction');
const { registerPythonHandlers } = require('./handlers/python');
const { registerThreeStepHandlers } = require('./handlers/three-step');
const { registerUpdateHandlers } = require('./handlers/updates');

// Try to load electron-updater, but don't fail if it's not installed
let autoUpdater = null;
let updaterAvailable = false;
try {
  const updaterModule = require('electron-updater');
  autoUpdater = updaterModule.autoUpdater;
  updaterAvailable = true;
  
  // Configure auto-updater
  autoUpdater.setAutoDownload(false); // Don't auto-download, let user decide
  autoUpdater.autoInstallOnAppQuit = true; // Install on app quit after download
  
  // For unsigned macOS apps, disable signature verification
  if (process.platform === 'darwin') {
    // Disable signature verification for unsigned apps
    autoUpdater.disableWebInstaller = false;
    // Use custom cache directory to avoid signature issues
    autoUpdater.updaterCacheDirName = 'com.yolo.trainer-updater';
  }
  
  // Configure auto-updater for GitHub releases (only in production)
  // electron-updater automatically reads from package.json build.publish
  // So we don't need to explicitly setFeedURL if publish config is correct
  if (process.env.NODE_ENV !== 'development' && !process.argv.includes('--dev')) {
    const packageJson = require('../../package.json');
    
    // Verify publish config exists
    if (packageJson.build?.publish?.provider === 'github') {
      console.log(`Auto-updater configured for GitHub: ${packageJson.build.publish.owner}/${packageJson.build.publish.repo}`);
    } else {
      console.warn('GitHub publish config not found in package.json, auto-updater may not work correctly');
    }
  }
  
  console.log('Auto-updater enabled');
} catch (e) {
  console.log('electron-updater not available, update functionality disabled:', e.message);
}

let mainWindow;

// Update check interval (check every 6 hours)
const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
let updateCheckTimer = null;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  mainWindow.loadFile('src/renderer/index.html');
}

app.whenReady().then(() => {
  createWindow();
  
  // Register all IPC handlers
  registerDatasetHandlers(ipcMain, mainWindow);
  registerFileHandlers(ipcMain, mainWindow);
  registerDownloadHandlers(ipcMain, mainWindow);
  registerAnnotationHandlers(ipcMain, mainWindow);
  registerTrainingHandlers(ipcMain, mainWindow);
  registerPredictionHandlers(ipcMain, mainWindow);
  registerPythonHandlers(ipcMain, mainWindow);
  registerThreeStepHandlers(ipcMain, mainWindow);
  registerUpdateHandlers(ipcMain, mainWindow, {
    updaterAvailable,
    autoUpdater,
    checkForUpdates
  });
  
  // Auto-update disabled until Apple Developer license is obtained
  // For now, users need to manually download updates from GitHub Releases
  // if (updaterAvailable) {
  //   checkForUpdates();
  //   
  //   // Set up periodic update checks
  //   updateCheckTimer = setInterval(() => {
  //     checkForUpdates();
  //   }, UPDATE_CHECK_INTERVAL);
  // }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
  }
  if (process.platform !== 'darwin') app.quit();
});

// Auto-updater event handlers (only if updater is available)
function checkForUpdates() {
  if (!updaterAvailable || !autoUpdater) {
    return;
  }
  
  if (process.platform === 'linux') {
    // Linux updates require manual setup, skip for now
    return;
  }
  
  autoUpdater.checkForUpdates().catch(err => {
    console.error('Error checking for updates:', err);
  });
}

if (updaterAvailable && autoUpdater) {
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes || 'New version available'
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('Update not available');
  });

  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater:', err);
    
    // Handle code signature errors on macOS for unsigned apps
    if (process.platform === 'darwin' && err.message && err.message.includes('code signature')) {
      console.warn('Code signature validation failed (expected for unsigned apps)');
      // For unsigned apps, we'll handle installation manually
      if (mainWindow) {
        mainWindow.webContents.send('update-error', 'Signature validation failed. Please download and install the update manually from GitHub Releases.');
      }
    } else {
      if (mainWindow) {
        mainWindow.webContents.send('update-error', err.message);
      }
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', {
        percent: progressObj.percent,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    console.log('Update info:', JSON.stringify(info, null, 2));
    
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        path: info.path || null
      });
    }
  });
}

// IPC Handlers are registered in app.whenReady() using handler modules
