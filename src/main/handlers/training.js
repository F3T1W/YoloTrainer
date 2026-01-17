const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs-extra');

/**
 * Registers training-related IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance.
 * @param {Electron.BrowserWindow} mainWindow - Main application window.
 */
function registerTrainingHandlers(ipcMain, mainWindow) {
  /**
   * Trains a YOLOv8 model with the specified dataset and parameters.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {Object} params - Training parameters.
   * @param {string} params.datasetPath - Path to the YOLO formatted dataset.
   * @param {number} params.epochs - Number of training epochs.
   * @param {number} params.batchSize - Batch size for training.
   * @param {number} params.imgSize - Image size for training (e.g., 640).
   * @param {string[]} params.classNames - Array of class names.
   * @param {string} [params.className] - Class name for model filename.
   * @param {number} [params.learningPercent] - Learning percentage for model filename (15, 35, 50, or 100).
   * @returns {Promise<Object>} Result object with success status and training output.
   * @returns {boolean} returns.success - Whether training completed successfully.
   * @returns {string} returns.message - Training output/logs.
   */
  ipcMain.handle('train-model', async (event, { datasetPath, epochs, batchSize, imgSize, classNames, className, learningPercent }) => {
    return new Promise((resolve, reject) => {
      const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
      const scriptPath = path.join(__dirname, '../../../python/yolo_trainer.py');
      
      const isAppleSilicon = process.platform === 'darwin' && process.arch === 'arm64';
      
      let optimizedBatchSize = batchSize;
      let optimizedWorkers = 8;
      
      if (isAppleSilicon) {
        if (imgSize <= 416) {
          optimizedBatchSize = Math.min(batchSize * 2, 64);
          optimizedWorkers = 12;
        } else if (imgSize <= 640) {
          optimizedBatchSize = Math.min(batchSize * 1.5, 48);
          optimizedWorkers = 10;
        } else {
          optimizedBatchSize = Math.min(batchSize, 32);
          optimizedWorkers = 8;
        }
        
        console.log(`Apple Silicon detected! Optimized batch size: ${optimizedBatchSize}, workers: ${optimizedWorkers}`);
      }
      
      const classNamesStr = Array.isArray(classNames) ? classNames.join(',') : '';
      const modelClassName = className || (classNamesStr.split(',')[0] || 'Unknown');
      const modelLearningPercent = learningPercent || 100;

      const pythonProcess = spawn(pythonPath, [
        scriptPath,
        '--data', datasetPath,
        '--epochs', epochs.toString(),
        '--batch', optimizedBatchSize.toString(),
        '--img', imgSize.toString(),
        '--output', path.join(__dirname, '../../../models'),
        '--class-names', classNamesStr,
        '--workers', optimizedWorkers.toString(),
        '--device', isAppleSilicon ? 'mps' : 'auto',
        '--model-class-name', modelClassName,
        '--model-learning-percent', modelLearningPercent.toString()
      ]);

      let output = '';
      pythonProcess.stdout.on('data', (d) => {
        output += d.toString();
        if (mainWindow) mainWindow.webContents.send('training-progress', d.toString());
      });
      
      pythonProcess.stderr.on('data', (d) => {
        if (mainWindow) mainWindow.webContents.send('training-progress', d.toString());
        console.error(`Training Info: ${d}`);
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, message: output });
        } else {
          reject(new Error(`Training failed with code ${code}`));
        }
      });
    });
  });

  /**
   * Exports a trained model to CodeSlave directory.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {Object} params - Export parameters.
   * @param {string} params.modelPath - Path to the model file (.pt).
   * @param {string} [params.outputPath] - Output path (currently unused, uses CodeSlave path).
   * @returns {Promise<Object>} Result object with success status.
   * @returns {boolean} returns.success - Whether export succeeded.
   * @returns {string} [returns.error] - Error message if export failed.
   */
  ipcMain.handle('export-model', async (event, { modelPath, outputPath }) => {
    try {
      const targetPath = path.join(__dirname, '../../../CodeSlave/python_bridge/custom_models');
      await fs.ensureDir(targetPath);
      await fs.copy(modelPath, path.join(targetPath, path.basename(modelPath)));
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  /**
   * Gets the path to the base YOLOv8n model file.
   * @returns {string} Path to yolov8n.pt.
   */
  ipcMain.handle('get-base-model-path', () => {
    return path.join(__dirname, '../../../yolov8n.pt');
  });

  /**
   * Gets the path to the most recently trained model (best.pt).
   * @returns {Promise<string|null>} Path to best.pt, or null if not found.
   */
  ipcMain.handle('get-trained-model-path', async () => {
    const modelPath = path.join(__dirname, '../../../models/custom_model/weights/best.pt');
    try {
      if (await fs.pathExists(modelPath)) {
        return modelPath;
      }
    } catch(e) {}
    return null;
  });
}

module.exports = { registerTrainingHandlers };
