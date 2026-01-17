const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const { logger } = require('../utils/logger');

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
        
        logger.info('Apple Silicon detected', { batchSize: optimizedBatchSize, workers: optimizedWorkers });
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
        logger.debug('Training output', d.toString());
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, message: output });
        } else {
          const errorMessage = output.includes('CUDA') || output.includes('device')
            ? 'GPU/CUDA error. Try using CPU mode or check your GPU drivers.'
            : output.includes('out of memory') || output.includes('OOM')
            ? 'Out of memory. Try reducing batch size or image size.'
            : output.includes('FileNotFoundError') || output.includes('not found')
            ? 'Dataset file not found. Please check the dataset path.'
            : `Training failed with code ${code}. Check the logs for details.`;
          reject(new Error(errorMessage));
        }
      });
    });
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
    } catch(e) {
      logger.debug('Model path check failed', e);
    }
    return null;
  });
}

module.exports = { registerTrainingHandlers };
