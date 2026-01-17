const path = require('path');
const { spawn } = require('child_process');
const { logger } = require('../utils/logger');

/**
 * Registers prediction-related IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance.
 * @param {Electron.BrowserWindow} mainWindow - Main application window.
 */
function registerPredictionHandlers(ipcMain, mainWindow) {
  /**
   * Runs object detection on an image using a trained YOLO model.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {Object} params - Prediction parameters.
   * @param {string} params.modelPath - Path to the model file (.pt).
   * @param {string} params.imagePath - Path to the image file.
   * @param {number} [params.conf] - Confidence threshold (0-1). Defaults to 0.25.
   * @returns {Promise<Object>} Result object with success, resultPath, output, and detections array.
   */
  ipcMain.handle('predict-image', async (event, { modelPath, imagePath, conf }) => {
    return new Promise((resolve, reject) => {
      const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
      const scriptPath = path.join(__dirname, '../../../python/predict.py');
      const confidence = conf || 0.25;
      
      const pythonProcess = spawn(pythonPath, [
        scriptPath,
        '--model', modelPath,
        '--source', imagePath,
        '--conf', confidence.toString()
      ]);

      let output = '';
      let resultPath = '';
      let detections = [];

      pythonProcess.stdout.on('data', (d) => {
        const line = d.toString();
        output += line;
        
        const markerIndex = line.indexOf('OUTPUT_PATH:');
        if (markerIndex !== -1) {
          const remaining = line.substring(markerIndex + 'OUTPUT_PATH:'.length);
          resultPath = remaining.split('\n')[0].trim();
        }

        const jsonMarkerIndex = line.indexOf('JSON_OUTPUT:');
        if (jsonMarkerIndex !== -1) {
          const remaining = line.substring(jsonMarkerIndex + 'JSON_OUTPUT:'.length);
          const jsonStr = remaining.split('\n')[0].trim();
          try {
            detections = JSON.parse(jsonStr);
          } catch (e) {
            logger.error('Failed to parse detection JSON', e);
          }
        }
      });
      
      pythonProcess.stderr.on('data', (d) => {
        logger.debug('Prediction info', { data: d });
      });

      pythonProcess.on('close', (code) => {
        if (code === 0 && resultPath) {
          resolve({ success: true, resultPath: resultPath, output: output, detections: detections });
        } else {
          if (code === 0) {
            reject(new Error(`Prediction finished but no output path found. Output: ${output}`));
          } else {
            reject(new Error(`Prediction failed with code ${code}. Output: ${output}`));
          }
        }
      });
    });
  });
}

module.exports = { registerPredictionHandlers };
