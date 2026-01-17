/**
 * Registers update-related IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance.
 * @param {Electron.BrowserWindow} mainWindow - Main application window.
 * @param {Object} updaterConfig - Updater configuration.
 * @param {boolean} updaterConfig.updaterAvailable - Whether updater is available.
 * @param {Object} updaterConfig.autoUpdater - AutoUpdater instance.
 * @param {Function} updaterConfig.checkForUpdates - Function to check for updates.
 */
function registerUpdateHandlers(ipcMain, mainWindow, { updaterAvailable, autoUpdater, checkForUpdates }) {
  /**
   * Checks for application updates (currently disabled).
   * @returns {Promise<Object>} Result object with success status.
   * @returns {boolean} returns.success - Whether check was initiated.
   * @returns {string} [returns.error] - Error message if check failed.
   */
  ipcMain.handle('check-for-updates', async () => {
    if (!updaterAvailable || !autoUpdater) {
      return { success: false, error: 'Auto-updater not available. Install electron-updater package.' };
    }
    try {
      checkForUpdates();
      return { success: true };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Downloads an available update (currently disabled).
   * @returns {Promise<Object>} Result object with success status.
   * @returns {boolean} returns.success - Whether download was initiated.
   * @returns {string} [returns.error] - Error message if download failed.
   */
  ipcMain.handle('download-update', async () => {
    if (!updaterAvailable || !autoUpdater) {
      return { success: false, error: 'Auto-updater not available. Install electron-updater package.' };
    }
    try {
      autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      console.error('Error downloading update:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Installs a downloaded update (currently disabled).
   * @returns {Promise<Object>} Result object with success status.
   * @returns {boolean} returns.success - Whether installation was initiated.
   * @returns {string} [returns.error] - Error message if installation failed.
   * @returns {boolean} [returns.manualInstall] - Whether manual installation is required (macOS unsigned apps).
   */
  ipcMain.handle('install-update', async () => {
    if (!updaterAvailable || !autoUpdater) {
      return { success: false, error: 'Auto-updater not available. Install electron-updater package.' };
    }
    try {
      if (process.platform === 'darwin') {
        console.log('Attempting to install update on macOS (unsigned app)...');
        autoUpdater.quitAndInstall(false, true);
      } else {
        autoUpdater.quitAndInstall(false, true);
      }
      return { success: true };
    } catch (error) {
      console.error('Error installing update:', error);
      
      if (process.platform === 'darwin' && error.message && error.message.includes('signature')) {
        return { 
          success: false, 
          error: 'Signature validation failed. Please download and install the update manually from GitHub Releases.',
          manualInstall: true
        };
      }
      
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerUpdateHandlers };
