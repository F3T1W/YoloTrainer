const { dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');

/**
 * Registers dataset-related IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance.
 * @param {Electron.BrowserWindow} mainWindow - Main application window.
 */
function registerDatasetHandlers(ipcMain, mainWindow) {
  /**
   * Opens a dialog to select a dataset folder.
   * @returns {Promise<string|null>} The selected folder path, or null if canceled.
   */
  ipcMain.handle('select-dataset-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  /**
   * Loads image files from a dataset folder.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {string} datasetPath - Path to the dataset folder.
   * @returns {Promise<string[]>} Array of image filenames (jpg, jpeg, png, webp).
   */
  ipcMain.handle('load-dataset', async (event, datasetPath) => {
    try {
      const imagesPath = path.join(datasetPath, 'images');
      const hasImagesFolder = await fs.pathExists(imagesPath);
      
      let targetPath = datasetPath;
      if (hasImagesFolder) {
        targetPath = imagesPath;
      }
      
      const files = await fs.readdir(targetPath);
      return files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    } catch (e) {
      return [];
    }
  });

  /**
   * Gets a list of image files from a dataset folder.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {string} datasetPath - Path to the dataset folder.
   * @returns {Promise<string[]>} Array of image filenames (jpg, jpeg, png, webp).
   */
  ipcMain.handle('get-images-list', async (event, datasetPath) => {
    try {
      const imagesPath = path.join(datasetPath, 'images');
      await fs.ensureDir(imagesPath);
      const files = await fs.readdir(imagesPath);
      return files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    } catch (e) {
      return [];
    }
  });

  /**
   * Gets the default temporary directory path for downloads.
   * @returns {Promise<string>} Path to the temporary directory.
   */
  ipcMain.handle('get-default-temp-path', async () => {
    return path.join(__dirname, '../../../datasets/temp');
  });

  /**
   * Gets the default datasets directory path.
   * @returns {Promise<string>} Path to the datasets directory.
   */
  ipcMain.handle('get-default-datasets-path', async () => {
    return path.join(__dirname, '../../../datasets/raw');
  });
}

module.exports = { registerDatasetHandlers };
