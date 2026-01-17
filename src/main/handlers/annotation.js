const path = require('path');
const fs = require('fs-extra');

/**
 * Registers annotation-related IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance.
 * @param {Electron.BrowserWindow} mainWindow - Main application window.
 */
function registerAnnotationHandlers(ipcMain, mainWindow) {
  /**
   * Saves annotation data to a YOLO format label file.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
   * @param {Object} params - Annotation parameters.
   * @param {string} params.imagePath - Path to the annotated image.
   * @param {Array<Object>} params.annotations - Array of annotation objects.
   * @param {string} params.annotations[].className - Class name for the annotation.
   * @param {number} params.annotations[].centerX - Normalized center X coordinate (0-1).
   * @param {number} params.annotations[].centerY - Normalized center Y coordinate (0-1).
   * @param {number} params.annotations[].width - Normalized width (0-1).
   * @param {number} params.annotations[].height - Normalized height (0-1).
   * @param {string[]} params.classNames - Array of all class names (for class ID mapping).
   * @returns {Promise<Object>} Result object with success status and optional error message.
   */
  ipcMain.handle('save-annotation', async (event, { imagePath, annotations, classNames }) => {
    try {
      let datasetDir;
      if (imagePath.includes(path.sep + 'images' + path.sep)) {
        datasetDir = path.dirname(path.dirname(imagePath));
      } else {
        datasetDir = path.dirname(imagePath);
      }
      const labelsDir = path.join(datasetDir, 'labels');
      await fs.ensureDir(labelsDir);
      
      const imageName = path.basename(imagePath, path.extname(imagePath));
      const labelPath = path.join(labelsDir, `${imageName}.txt`);
      
      const lines = annotations.map(ann => {
        const classId = classNames.indexOf(ann.className);
        return `${classId} ${ann.centerX} ${ann.centerY} ${ann.width} ${ann.height}`;
      });
      
      await fs.writeFile(labelPath, lines.join('\n'));
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = { registerAnnotationHandlers };
