const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { logger } = require('./utils/logger');

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
      logger.info(`Auto-updater configured for GitHub: ${packageJson.build.publish.owner}/${packageJson.build.publish.repo}`);
    } else {
      logger.warn('GitHub publish config not found in package.json, auto-updater may not work correctly');
    }
  }
  
  logger.info('Auto-updater enabled');
} catch (e) {
  logger.warn('electron-updater not available, update functionality disabled', e.message);
}

let mainWindow;


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
  // Set Dock icon for macOS (works in development mode)
  // Note: app.dock.setIcon() requires PNG format, not .icns
  // Use icon-dock.png if available (with rounded corners), otherwise fallback to icon.png
  if (process.platform === 'darwin') {
    const dockIconPath = path.resolve(__dirname, '../../build/icon-dock.png');
    const fallbackIconPath = path.resolve(__dirname, '../../build/icon.png');
    
    try {
      let iconToUse = null;
      if (fs.existsSync(dockIconPath)) {
        iconToUse = dockIconPath;
        logger.info('Using Dock-optimized icon:', iconToUse);
      } else if (fs.existsSync(fallbackIconPath)) {
        iconToUse = fallbackIconPath;
        logger.info('Using standard icon:', iconToUse);
      }
      
      if (iconToUse) {
        app.dock.setIcon(iconToUse);
        logger.info('Dock icon set successfully');
      } else {
        logger.warn('No icon file found');
      }
    } catch (error) {
      logger.warn('Failed to set Dock icon:', error.message);
    }
  }
  
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
    logger.error('Error checking for updates', err);
  });
}

if (updaterAvailable && autoUpdater) {
  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    logger.info('Update available', { version: info.version });
    if (mainWindow) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes || 'New version available'
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    logger.debug('Update not available');
  });

  autoUpdater.on('error', (err) => {
    logger.error('Error in auto-updater', err);
    
    // Handle code signature errors on macOS for unsigned apps
    if (process.platform === 'darwin' && err.message && err.message.includes('code signature')) {
      logger.warn('Code signature validation failed (expected for unsigned apps)');
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
    logger.info('Update downloaded', { version: info.version, info: info });
    
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        path: info.path || null
      });
    }
  });
}

// IPC Handlers are registered in app.whenReady() using handler modules
