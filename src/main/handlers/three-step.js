const path = require('path');
const fs = require('fs-extra');
const { logger } = require('../utils/logger');

/**
 * Registers three-step system IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance.
 * @param {Electron.BrowserWindow} mainWindow - Main application window.
 */
function registerThreeStepHandlers(ipcMain, mainWindow) {
  /**
   * Distributes downloaded images into three-step folders (15%, 35%, 50%).
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {Object} params - Distribution parameters.
   * @param {string} params.sourcePath - Path to the source folder with downloaded images.
   * @param {string} params.basePath - Base path where class folders will be created.
   * @param {string} params.className - Name of the class (used for folder naming).
   * @param {number} params.totalCount - Total number of images to distribute.
   * @returns {Promise<Object>} Result object with success, basePath, and counts per folder.
   */
  ipcMain.handle('distribute-three-step-images', async (event, { sourcePath, basePath, className, totalCount }) => {
    try {
      const sourceDir = sourcePath;
      const baseDir = basePath;
      
      logger.debug('Distribute-three-step-images called', {
        sourcePath,
        basePath,
        className,
        totalCount
      });
      
      await fs.ensureDir(baseDir);
      logger.debug('Base directory ensured', { baseDir });
      
      const classFolder = path.join(baseDir, className);
      await fs.ensureDir(classFolder);
      logger.debug('Class folder created', { classFolder });
      
      const folder15 = path.join(classFolder, `${className}_15`);
      const folder35 = path.join(classFolder, `${className}_35`);
      const folder50 = path.join(classFolder, `${className}_50`);
      
      await fs.ensureDir(path.join(folder15, 'images'));
      await fs.ensureDir(path.join(folder15, 'labels'));
      await fs.ensureDir(path.join(folder35, 'images'));
      await fs.ensureDir(path.join(folder35, 'labels'));
      await fs.ensureDir(path.join(folder50, 'images'));
      await fs.ensureDir(path.join(folder50, 'labels'));
      
      logger.debug('Subfolders created', {
        folder15,
        folder35,
        folder50
      });
      
      const files = await fs.readdir(sourceDir);
      const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
      const n = typeof totalCount === 'number' && totalCount > 0 ? totalCount : imageFiles.length;
      const count15 = Math.floor(n * 0.15);
      const count35 = Math.floor(n * 0.35);
      
      for (let i = 0; i < count15 && i < imageFiles.length; i++) {
        const src = path.join(sourceDir, imageFiles[i]);
        const dest = path.join(folder15, 'images', imageFiles[i]);
        await fs.copy(src, dest);
      }
      
      for (let i = count15; i < count15 + count35 && i < imageFiles.length; i++) {
        const src = path.join(sourceDir, imageFiles[i]);
        const dest = path.join(folder35, 'images', imageFiles[i]);
        await fs.copy(src, dest);
      }
      
      for (let i = count15 + count35; i < imageFiles.length; i++) {
        const src = path.join(sourceDir, imageFiles[i]);
        const dest = path.join(folder50, 'images', imageFiles[i]);
        await fs.copy(src, dest);
      }
      
      const actualCount15 = Math.min(count15, imageFiles.length);
      const actualCount35 = Math.min(count35, Math.max(0, imageFiles.length - count15));
      const actualCount50 = Math.max(0, imageFiles.length - count15 - count35);
      for (const f of imageFiles) {
        await fs.remove(path.join(sourceDir, f));
      }
      return {
        success: true,
        basePath: classFolder,
        counts: {
          folder15: actualCount15,
          folder35: actualCount35,
          folder50: actualCount50
        }
      };
    } catch (error) {
      logger.error('Error distributing images', error);
      throw error;
    }
  });

  /**
   * Merges annotations from three-step folders (15, 35, 50) into a single output folder.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {Object} params - Merge parameters.
   * @param {string} params.basePath - Base path containing the three-step folders.
   * @param {string} params.className - Class name (used to locate folders: className_15, className_35, className_50).
   * @param {string} params.outputFolder - Output folder path where merged images and labels will be saved.
   * @returns {Promise<Object>} Result object with merge statistics.
   * @returns {boolean} returns.success - Whether merge succeeded.
   * @returns {number} returns.totalImages - Total number of images merged.
   * @returns {number} returns.totalLabels - Total number of labels merged.
   */
  ipcMain.handle('merge-three-step-annotations', async (event, { basePath, className, outputFolder }) => {
    try {
      logger.info('Merging three-step annotations', { basePath, className, outputFolder });
      
      const outputImagesPath = path.join(outputFolder, 'images');
      const outputLabelsPath = path.join(outputFolder, 'labels');
      await fs.ensureDir(outputImagesPath);
      await fs.ensureDir(outputLabelsPath);
      
      const folder15 = path.join(basePath, `${className}_15`);
      const folder35 = path.join(basePath, `${className}_35`);
      const folder50 = path.join(basePath, `${className}_50`);
      
      let totalImages = 0;
      let totalLabels = 0;
      
      const folder15Images = path.join(folder15, 'images');
      const folder15Labels = path.join(folder15, 'labels');
      if (await fs.pathExists(folder15Images)) {
        const images = await fs.readdir(folder15Images);
        for (const img of images) {
          if (/\.(jpg|jpeg|png|webp)$/i.test(img)) {
            await fs.copy(path.join(folder15Images, img), path.join(outputImagesPath, img));
            totalImages++;
            
            const labelName = path.basename(img, path.extname(img)) + '.txt';
            const labelPath = path.join(folder15Labels, labelName);
            if (await fs.pathExists(labelPath)) {
              await fs.copy(labelPath, path.join(outputLabelsPath, labelName));
              totalLabels++;
            }
          }
        }
      }
      logger.debug(`Merged from folder 15: ${totalImages} images, ${totalLabels} labels`);
      
      const folder35Images = path.join(folder35, 'images');
      const folder35Labels = path.join(folder35, 'labels');
      if (await fs.pathExists(folder35Images)) {
        const images = await fs.readdir(folder35Images);
        for (const img of images) {
          if (/\.(jpg|jpeg|png|webp)$/i.test(img)) {
            await fs.copy(path.join(folder35Images, img), path.join(outputImagesPath, img));
            totalImages++;
            
            const labelName = path.basename(img, path.extname(img)) + '.txt';
            const labelPath = path.join(folder35Labels, labelName);
            if (await fs.pathExists(labelPath)) {
              await fs.copy(labelPath, path.join(outputLabelsPath, labelName));
              totalLabels++;
            }
          }
        }
      }
      logger.debug(`Merged from folder 35: ${totalImages} images, ${totalLabels} labels`);
      
      const folder50Images = path.join(folder50, 'images');
      const folder50Labels = path.join(folder50, 'labels');
      if (await fs.pathExists(folder50Images)) {
        const images = await fs.readdir(folder50Images);
        for (const img of images) {
          if (/\.(jpg|jpeg|png|webp)$/i.test(img)) {
            await fs.copy(path.join(folder50Images, img), path.join(outputImagesPath, img));
            totalImages++;
            
            const labelName = path.basename(img, path.extname(img)) + '.txt';
            const labelPath = path.join(folder50Labels, labelName);
            if (await fs.pathExists(labelPath)) {
              await fs.copy(labelPath, path.join(outputLabelsPath, labelName));
              totalLabels++;
            }
          }
        }
      }
      logger.debug(`Merged from folder 50: ${totalImages} images, ${totalLabels} labels`);
      
      logger.info(`Total merged: ${totalImages} images, ${totalLabels} labels`);
      return { success: true, totalImages, totalLabels };
    } catch (error) {
      logger.error('Error merging three-step annotations', error);
      throw error;
    }
  });
}

module.exports = { registerThreeStepHandlers };
