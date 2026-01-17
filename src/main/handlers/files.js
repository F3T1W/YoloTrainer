const { dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { logger } = require('../utils/logger');

/**
 * Registers file operation IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance.
 * @param {Electron.BrowserWindow} mainWindow - Main application window.
 */
function registerFileHandlers(ipcMain, mainWindow) {
  /**
   * Checks if a file or directory exists.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {string} filePath - Path to check.
   * @returns {Promise<boolean>} True if the path exists, false otherwise.
   */
  ipcMain.handle('file-exists', async (event, filePath) => {
    try {
      return await fs.pathExists(filePath);
    } catch (e) {
      return false;
    }
  });

  /**
   * Joins multiple path segments into a single path.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {string[]} paths - Array of path segments to join.
   * @returns {Promise<string>} The joined path.
   */
  ipcMain.handle('join-path', async (event, paths) => {
    return path.join(...paths);
  });

  /**
   * Reads the contents of a text file.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {string} filePath - Path to the file to read.
   * @returns {Promise<string>} File contents as UTF-8 string, or empty string on error.
   */
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (e) {
      return '';
    }
  });

  /**
   * Lists .txt files in a directory (typically label files).
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {string} dirPath - Path to the directory.
   * @returns {Promise<string[]>} Array of .txt filenames, or empty array on error.
   */
  ipcMain.handle('list-files', async (event, dirPath) => {
    try {
      const exists = await fs.pathExists(dirPath);
      if (!exists) return [];
      const files = await fs.readdir(dirPath);
      return files.filter(f => f.endsWith('.txt'));
    } catch (e) {
      return [];
    }
  });

  /**
   * Opens a dialog to select a file.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {Array<Object>} [filters] - File type filters (e.g., [{ name: 'YOLO Model', extensions: ['pt'] }]).
   * @returns {Promise<string|null>} Selected file path, or null if canceled.
   */
  ipcMain.handle('select-file', async (event, filters) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters || []
    });
    return result.canceled ? null : result.filePaths[0];
  });

  /**
   * Copies a folder and its contents to a destination.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {Object} params - Copy parameters.
   * @param {string} params.source - Source folder path.
   * @param {string} params.destination - Destination folder path.
   * @returns {Promise<Object>} Result object with success status.
   * @returns {boolean} returns.success - Whether copy succeeded.
   * @returns {string} [returns.error] - Error message if copy failed.
   */
  ipcMain.handle('copy-folder', async (event, { source, destination }) => {
    try {
      logger.debug('Copying folder', { source, destination });
      
      const sourceExists = await fs.pathExists(source);
      if (!sourceExists) {
        logger.warn('Source folder does not exist', { source });
        return { success: false, error: 'Source folder does not exist' };
      }
      
      const destParent = path.dirname(destination);
      await fs.ensureDir(destParent);
      
      if (await fs.pathExists(destination)) {
        await fs.remove(destination);
      }
      
      await fs.copy(source, destination, { overwrite: true });
      
      logger.info('Folder copied successfully', { source, destination });
      return { success: true };
    } catch (error) {
      logger.error('Error copying folder', error);
      throw error;
    }
  });

  /**
   * Removes a folder and its contents.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {string} folderPath - Path to the folder to remove.
   * @returns {Promise<Object>} Result object with success status.
   * @returns {boolean} returns.success - Whether removal succeeded.
   * @returns {string} [returns.error] - Error message if removal failed.
   */
  ipcMain.handle('remove-folder', async (event, folderPath) => {
    try {
      logger.debug('Removing folder', { folderPath });
      
      const folderExists = await fs.pathExists(folderPath);
      if (folderExists) {
        await fs.remove(folderPath);
        logger.info('Folder removed successfully', { folderPath });
        return { success: true };
      } else {
        logger.debug('Folder does not exist', { folderPath });
        return { success: false, error: 'Folder does not exist' };
      }
    } catch (error) {
      logger.error('Error removing folder', error);
      throw error;
    }
  });

  /**
   * Opens the models history folder in the system file manager.
   * @returns {Promise<Object>} Result object with success status.
   * @returns {boolean} returns.success - Whether the folder was opened successfully.
   * @returns {string} [returns.error] - Error message if opening failed.
   */
  ipcMain.handle('open-models-folder', async () => {
    const modelsHistoryPath = path.join(__dirname, '../../../models/models_history');
    
    try {
      await fs.ensureDir(modelsHistoryPath);
      await shell.openPath(modelsHistoryPath);
      return { success: true };
    } catch (e) {
      logger.error('Error opening models folder', e);
      return { success: false, error: e.message };
    }
  });
}

module.exports = { registerFileHandlers };
