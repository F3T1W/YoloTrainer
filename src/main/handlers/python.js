const pythonEnv = require('../utils/python-env');

/**
 * Registers Python environment-related IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance.
 * @param {Electron.BrowserWindow} mainWindow - Main application window.
 */
function registerPythonHandlers(ipcMain, mainWindow) {
  /**
   * Checks the status of Python installation and virtual environment.
   * @returns {Promise<Object>} Status object with Python information.
   * @returns {boolean} returns.pythonInstalled - Whether Python is installed.
   * @returns {string|null} returns.pythonVersion - Python version string, or null if not installed.
   * @returns {boolean} returns.venvExists - Whether virtual environment exists.
   * @returns {boolean} returns.packagesInstalled - Whether required packages (ultralytics) are installed.
   */
  ipcMain.handle('check-python-status', async () => {
    const result = {
      pythonInstalled: false,
      pythonVersion: null,
      venvExists: false,
      packagesInstalled: false
    };
    
    try {
      const pythonCheck = await pythonEnv.checkPythonInstalled();
      result.pythonInstalled = pythonCheck.installed;
      result.pythonVersion = pythonCheck.version;
      
      result.venvExists = await pythonEnv.checkVenvExists();
      
      if (result.venvExists) {
        result.packagesInstalled = await pythonEnv.checkPackagesInstalled(['ultralytics']);
      }
      
      return result;
    } catch (error) {
      logger.error('Error checking Python status', error);
      throw error;
    }
  });

  /**
   * Sets up Python virtual environment for the application.
   * @returns {Promise<Object>} Result object with success status and logs.
   * @returns {boolean} returns.success - Whether setup succeeded.
   * @returns {string} returns.logs - Setup process logs.
   */
  ipcMain.handle('setup-python-environment', async () => {
    const allLogs = [];
    
    try {
      const pythonCheck = await pythonEnv.checkPythonInstalled();
      if (!pythonCheck.installed) {
        allLogs.push('✗ Python is not installed. Please install Python 3.8+ first.');
        return { success: false, logs: allLogs.join('\n') };
      }
      allLogs.push('✓ Python is installed');
      
      const venvExists = await pythonEnv.checkVenvExists();
      if (!venvExists) {
        const createResult = await pythonEnv.createVenv();
        allLogs.push(...createResult.logs);
        if (!createResult.success) {
          return { success: false, logs: allLogs.join('\n') };
        }
      } else {
        allLogs.push('✓ Virtual environment already exists');
      }
      
      return { success: true, logs: allLogs.join('\n') };
    } catch (error) {
      allLogs.push(`✗ Error: ${error.message}`);
      return { success: false, logs: allLogs.join('\n') };
    }
  });

  /**
   * Installs Python packages from requirements.txt into the virtual environment.
   * @returns {Promise<Object>} Result object with success status and logs.
   * @returns {boolean} returns.success - Whether installation succeeded.
   * @returns {string} returns.logs - Installation process logs.
   */
  ipcMain.handle('install-python-packages', async () => {
    const allLogs = [];
    
    try {
      const requirementsResult = await pythonEnv.getRequirementsPath();
      allLogs.push(...requirementsResult.logs);
      
      if (!requirementsResult.success) {
        return { success: false, logs: allLogs.join('\n') };
      }
      
      const venvExists = await pythonEnv.checkVenvExists();
      if (!venvExists) {
        allLogs.push('✗ Virtual environment not found. Please setup environment first.');
        return { success: false, logs: allLogs.join('\n') };
      }
      
      const upgradeResult = await pythonEnv.upgradePip();
      allLogs.push(...upgradeResult.logs);
      
      const installResult = await pythonEnv.installPackages(requirementsResult.path);
      allLogs.push(...installResult.logs);
      
      return { 
        success: installResult.success, 
        logs: allLogs.join('\n') 
      };
    } catch (error) {
      allLogs.push(`✗ Error: ${error.message}`);
      return { success: false, logs: allLogs.join('\n') };
    }
  });
}

module.exports = { registerPythonHandlers, getVenvPath: pythonEnv.getVenvPath };
