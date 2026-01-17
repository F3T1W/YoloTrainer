const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs-extra');

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
      console.log(`Auto-updater configured for GitHub: ${packageJson.build.publish.owner}/${packageJson.build.publish.repo}`);
    } else {
      console.warn('GitHub publish config not found in package.json, auto-updater may not work correctly');
    }
  }
  
  console.log('Auto-updater enabled');
} catch (e) {
  console.log('electron-updater not available, update functionality disabled:', e.message);
}

let mainWindow;

// Update check interval (check every 6 hours)
const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
let updateCheckTimer = null;

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
  createWindow();
  
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
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
  }
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
    console.error('Error checking for updates:', err);
  });
}

if (updaterAvailable && autoUpdater) {
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes || 'New version available'
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('Update not available');
  });

  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater:', err);
    
    // Handle code signature errors on macOS for unsigned apps
    if (process.platform === 'darwin' && err.message && err.message.includes('code signature')) {
      console.warn('Code signature validation failed (expected for unsigned apps)');
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
    console.log('Update downloaded:', info.version);
    console.log('Update info:', JSON.stringify(info, null, 2));
    
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        path: info.path || null
      });
    }
  });
}

// IPC Handlers

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

let currentDownloadProcess = null;
let downloadPaused = false;
let downloadStopped = false;

/**
 * Downloads images from a Reddit subreddit.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Object} params - Download parameters.
 * @param {string} params.subreddit - Name of the subreddit to download from.
 * @param {number} params.limit - Maximum number of images to download.
 * @param {string} params.class_name - Class name for organizing downloaded images.
 * @param {string} [params.output_dir] - Output directory path. Defaults to datasets/raw.
 * @param {boolean} [params.three_step_mode] - Enable three-step distribution mode.
 * @returns {Promise<Object>} Result object with success status, message, and downloaded count.
 * @returns {boolean} returns.success - Whether the download completed successfully.
 * @returns {string} returns.message - Output message from the download script.
 * @returns {number} returns.downloaded - Number of images downloaded.
 * @returns {boolean} [returns.stopped] - Whether the download was stopped by user.
 */
ipcMain.handle('download-reddit-images', async (event, { subreddit, limit, class_name, output_dir, three_step_mode }) => {
  return new Promise((resolve, reject) => {
    downloadPaused = false;
    downloadStopped = false;
    
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(__dirname, '../../python/reddit_downloader.py');
    
    const outputPath = output_dir || path.join(__dirname, '../../datasets/raw');
    
    const args = [
      scriptPath,
      '--subreddit', subreddit,
      '--limit', limit.toString(),
      '--class', class_name,
      '--output', outputPath
    ];
    
    if (three_step_mode) {
      args.push('--three-step');
    }
    
    const pythonProcess = spawn(pythonPath, args);

    currentDownloadProcess = pythonProcess;
    let output = '';
    let downloadedCount = 0;
    
    pythonProcess.stdout.on('data', (d) => {
      if (downloadStopped) return;
      
      const data = d.toString();
      output += data;
      if (mainWindow && !downloadPaused) {
        mainWindow.webContents.send('download-progress', data);
      }
      
      const match = data.match(/Downloaded\s+(\d+)\/(\d+):|Download complete!\s+(\d+)\s+images/);
      if (match) {
        downloadedCount = parseInt(match[1] || match[3] || 0);
      }
    });
    
    pythonProcess.stderr.on('data', (d) => {
      if (!downloadStopped) {
        console.error(`Reddit Download Error: ${d}`);
      }
    });

    pythonProcess.on('close', (code) => {
      currentDownloadProcess = null;
      if (downloadStopped) {
        // Don't reject - just resolve with stopped flag to avoid error message
        resolve({ success: false, stopped: true, message: 'Download stopped by user' });
        return;
      }
      
      if (code === 0) {
        if (downloadedCount === 0) {
          const lastLineMatch = output.match(/Download complete!\s+(\d+)\s+images/);
          if (lastLineMatch) {
            downloadedCount = parseInt(lastLineMatch[1]);
          } else {
            downloadedCount = limit;
          }
        }
        resolve({ success: true, message: output, downloaded: downloadedCount });
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
});

/**
 * Pauses the current Reddit image download process.
 * @returns {Promise<Object>} Result object with success status.
 * @returns {boolean} returns.success - Whether the pause operation succeeded.
 * @returns {string} [returns.error] - Error message if pause failed.
 */
ipcMain.handle('pause-download', async () => {
  if (currentDownloadProcess && !downloadStopped) {
    downloadPaused = true;
    // SIGSTOP/SIGCONT don't work on Windows, so we'll use a flag-based approach
    // The Python script will check for a pause file
    if (process.platform !== 'win32') {
      currentDownloadProcess.kill('SIGSTOP');
    }
    return { success: true };
  }
  return { success: false, error: 'No active download' };
});

/**
 * Resumes a paused Reddit image download process.
 * @returns {Promise<Object>} Result object with success status.
 * @returns {boolean} returns.success - Whether the resume operation succeeded.
 * @returns {string} [returns.error] - Error message if resume failed.
 */
ipcMain.handle('resume-download', async () => {
  if (currentDownloadProcess && !downloadStopped && downloadPaused) {
    downloadPaused = false;
    if (process.platform !== 'win32') {
      currentDownloadProcess.kill('SIGCONT');
    }
    return { success: true };
  }
  return { success: false, error: 'No paused download' };
});

/**
 * Stops the current Reddit image download process.
 * @returns {Promise<Object>} Result object with success status.
 * @returns {boolean} returns.success - Whether the stop operation succeeded.
 * @returns {string} [returns.error] - Error message if stop failed.
 */
ipcMain.handle('stop-download', async () => {
  if (currentDownloadProcess) {
    downloadStopped = true;
    downloadPaused = false;
    currentDownloadProcess.kill('SIGTERM');
    currentDownloadProcess = null;
    return { success: true };
  }
  return { success: false, error: 'No active download' };
});

/**
 * Opens the models history folder in the system file manager.
 * @returns {Promise<Object>} Result object with success status.
 * @returns {boolean} returns.success - Whether the folder was opened successfully.
 * @returns {string} [returns.error] - Error message if opening failed.
 */
ipcMain.handle('open-models-folder', async () => {
  const { shell } = require('electron');
  const modelsHistoryPath = path.join(__dirname, '../../models/models_history');
  
  try {
    await fs.ensureDir(modelsHistoryPath);
    await shell.openPath(modelsHistoryPath);
    return { success: true };
  } catch (e) {
    console.error('Error opening models folder:', e);
    return { success: false, error: e.message };
  }
});

/**
 * Gets the default temporary directory path for downloads.
 * @returns {Promise<string>} Path to the temporary directory.
 */
ipcMain.handle('get-default-temp-path', async () => {
  return path.join(__dirname, '../../datasets/temp');
});

/**
 * Gets the default datasets directory path.
 * @returns {Promise<string>} Path to the datasets directory.
 */
ipcMain.handle('get-default-datasets-path', async () => {
  return path.join(__dirname, '../../datasets/raw');
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
 * Distributes downloaded images into three-step folders (15%, 35%, 50%).
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Object} params - Distribution parameters.
 * @param {string} params.sourcePath - Path to the source folder with downloaded images.
 * @param {string} params.basePath - Base path where class folders will be created.
 * @param {string} params.className - Name of the class (used for folder naming).
 * @param {number} params.totalCount - Total number of images to distribute.
 * @returns {Promise<Object>} Result object with distribution details.
 * @returns {boolean} returns.success - Whether distribution succeeded.
 * @returns {string} returns.basePath - Path to the created class folder.
 * @returns {Object} returns.counts - Distribution counts per folder.
 * @returns {number} returns.counts.folder15 - Number of images in 15% folder.
 * @returns {number} returns.counts.folder35 - Number of images in 35% folder.
 * @returns {number} returns.counts.folder50 - Number of images in 50% folder.
 */
ipcMain.handle('distribute-three-step-images', async (event, { sourcePath, basePath, className, totalCount }) => {
  try {
    const fs = require('fs-extra');
    const sourceDir = sourcePath;
    const baseDir = basePath;
    
    console.log('Distribute-three-step-images called with:', {
      sourcePath,
      basePath,
      className,
      totalCount
    });
    
    await fs.ensureDir(baseDir);
    console.log('Base directory ensured:', baseDir);
    
    const classFolder = path.join(baseDir, className);
    await fs.ensureDir(classFolder);
    console.log('Class folder created:', classFolder);
    
    const folder15 = path.join(classFolder, `${className}_15`);
    const folder35 = path.join(classFolder, `${className}_35`);
    const folder50 = path.join(classFolder, `${className}_50`);
    
    await fs.ensureDir(path.join(folder15, 'images'));
    await fs.ensureDir(path.join(folder15, 'labels'));
    await fs.ensureDir(path.join(folder35, 'images'));
    await fs.ensureDir(path.join(folder35, 'labels'));
    await fs.ensureDir(path.join(folder50, 'images'));
    await fs.ensureDir(path.join(folder50, 'labels'));
    
    console.log('Subfolders created:', {
      folder15,
      folder35,
      folder50
    });
    
    const files = await fs.readdir(sourceDir);
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    
    // Three-step distribution: 150, 350, rest (ideally 500)
    // Don't shuffle - images are already in correct order from download
    const count15 = 150;
    const count35 = 350;
    
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
    
    await fs.remove(sourceDir);
    
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
    console.error('Error distributing images:', error);
    throw error;
  }
});

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
 * @returns {Promise<Object>} Result object with success status.
 * @returns {boolean} returns.success - Whether the annotation was saved successfully.
 * @returns {string} [returns.error] - Error message if save failed.
 */
ipcMain.handle('save-annotation', async (event, { imagePath, annotations, classNames }) => {
  try {
    // Determine labels directory based on image path structure
    // If imagePath is CLASSNAME/images/image.jpg, labels should be in CLASSNAME/labels
    // If imagePath is CLASSNAME/image.jpg, labels should be in CLASSNAME/labels
    let datasetDir;
    if (imagePath.includes(path.sep + 'images' + path.sep)) {
      // Image is in images subfolder: CLASSNAME/images/image.jpg
      datasetDir = path.dirname(path.dirname(imagePath));
    } else {
      // Image is directly in class folder: CLASSNAME/image.jpg
      datasetDir = path.dirname(imagePath);
    }
    const labelsDir = path.join(datasetDir, 'labels');
    await fs.ensureDir(labelsDir);
    
    const imageName = path.basename(imagePath, path.extname(imagePath));
    const labelPath = path.join(labelsDir, `${imageName}.txt`);
    
    // YOLO format: class_id center_x center_y width height (normalized)
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
    const scriptPath = path.join(__dirname, '../../python/yolo_trainer.py');
    
    const isAppleSilicon = process.platform === 'darwin' && process.arch === 'arm64';
    
    // Optimize batch size for Apple Silicon (M1/M2/M3/M4) - larger unified memory can handle bigger batches
    let optimizedBatchSize = batchSize;
    let optimizedWorkers = 8;
    
    if (isAppleSilicon) {
      // Optimize based on image size: larger images = smaller batch
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
      '--output', path.join(__dirname, '../../models'),
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
      // YOLO outputs progress to stderr, forward to UI
      if (mainWindow) mainWindow.webContents.send('training-progress', d.toString());
      console.error(`Training Info: ${d}`);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        // Model is already saved to history by Python script (yolo_trainer.py)
        // No need to duplicate it here
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
 * Gets the path to the base YOLOv8n model file.
 * @returns {string} Path to yolov8n.pt.
 */
ipcMain.handle('get-base-model-path', () => {
  return path.join(__dirname, '../../yolov8n.pt');
});

/**
 * Gets the path to the most recently trained model (best.pt).
 * @returns {Promise<string|null>} Path to best.pt, or null if not found.
 */
ipcMain.handle('get-trained-model-path', async () => {
  const modelPath = path.join(__dirname, '../../models/custom_model/weights/best.pt');
  try {
    if (await fs.pathExists(modelPath)) {
        return modelPath;
    }
  } catch(e) {}
  return null;
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
 * Runs object detection on an image using a trained YOLO model.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event.
 * @param {Object} params - Prediction parameters.
 * @param {string} params.modelPath - Path to the model file (.pt).
 * @param {string} params.imagePath - Path to the image file.
 * @param {number} [params.conf] - Confidence threshold (0-1). Defaults to 0.25.
 * @returns {Promise<Object>} Result object with detection results.
 * @returns {boolean} returns.success - Whether prediction succeeded.
 * @returns {string} returns.resultPath - Path to the annotated result image.
 * @returns {string} returns.output - Raw output from prediction script.
 * @returns {Array<Object>} returns.detections - Array of detected objects.
 * @returns {string} returns.detections[].class_name - Detected class name.
 * @returns {number} returns.detections[].confidence - Detection confidence (0-1).
 * @returns {Array<number>} returns.detections[].bbox - Bounding box coordinates [x1, y1, x2, y2].
 */
ipcMain.handle('predict-image', async (event, { modelPath, imagePath, conf }) => {
  return new Promise((resolve, reject) => {
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(__dirname, '../../python/predict.py');
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
      
      // Look for result path
      const markerIndex = line.indexOf('OUTPUT_PATH:');
      if (markerIndex !== -1) {
        const remaining = line.substring(markerIndex + 'OUTPUT_PATH:'.length);
        resultPath = remaining.split('\n')[0].trim();
      }

      // Look for JSON output
      const jsonMarkerIndex = line.indexOf('JSON_OUTPUT:');
      if (jsonMarkerIndex !== -1) {
        const remaining = line.substring(jsonMarkerIndex + 'JSON_OUTPUT:'.length);
        const jsonStr = remaining.split('\n')[0].trim();
        try {
            detections = JSON.parse(jsonStr);
        } catch (e) {
            console.error('Failed to parse detection JSON:', e);
        }
      }
    });
    
    pythonProcess.stderr.on('data', (d) => {
      console.error(`Prediction Info: ${d}`);
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
    const fs = require('fs-extra');
    console.log('Copying folder from', source, 'to', destination);
    
    const sourceExists = await fs.pathExists(source);
    if (!sourceExists) {
      console.log('Source folder does not exist:', source);
      return { success: false, error: 'Source folder does not exist' };
    }
    
    const destParent = path.dirname(destination);
    await fs.ensureDir(destParent);
    
    if (await fs.pathExists(destination)) {
      await fs.remove(destination);
    }
    
    await fs.copy(source, destination, { overwrite: true });
    
    console.log('Folder copied successfully');
    return { success: true };
  } catch (error) {
    console.error('Error copying folder:', error);
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
    const fs = require('fs-extra');
    console.log('Removing folder:', folderPath);
    
    const folderExists = await fs.pathExists(folderPath);
    if (folderExists) {
      await fs.remove(folderPath);
      console.log('Folder removed successfully');
      return { success: true };
    } else {
      console.log('Folder does not exist:', folderPath);
      return { success: false, error: 'Folder does not exist' };
    }
  } catch (error) {
    console.error('Error removing folder:', error);
    throw error;
  }
});

// Get venv path - use userData for packaged apps (because .asar is read-only)
function getVenvPath() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'venv');
  } else {
    return path.join(__dirname, '../../venv');
  }
}

/**
 * Checks the status of Python installation and virtual environment.
 * @returns {Promise<Object>} Status object with Python information.
 * @returns {boolean} returns.pythonInstalled - Whether Python is installed.
 * @returns {string|null} returns.pythonVersion - Python version string, or null if not installed.
 * @returns {boolean} returns.venvExists - Whether virtual environment exists.
 * @returns {boolean} returns.packagesInstalled - Whether required packages (ultralytics) are installed.
 */
ipcMain.handle('check-python-status', async () => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  const fs = require('fs-extra');
  
  const result = {
    pythonInstalled: false,
    pythonVersion: null,
    venvExists: false,
    packagesInstalled: false
  };
  
  try {
    const pythonCmd = process.platform === 'win32' ? 'python --version' : 'python3 --version';
    try {
      const { stdout } = await execAsync(pythonCmd);
      result.pythonInstalled = true;
      result.pythonVersion = stdout.trim();
    } catch (e) {
      result.pythonInstalled = false;
    }
    
    const venvPath = getVenvPath();
    result.venvExists = await fs.pathExists(venvPath);
    
    if (result.venvExists) {
      const pythonPath = process.platform === 'win32' 
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python3');
      
      if (await fs.pathExists(pythonPath)) {
        try {
          const { stdout } = await execAsync(`"${pythonPath}" -c "import ultralytics; print('OK')"`);
          result.packagesInstalled = stdout.includes('OK');
        } catch (e) {
          result.packagesInstalled = false;
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error checking Python status:', error);
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
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  const fs = require('fs-extra');
  
  const logs = [];
  const venvPath = getVenvPath();
  
  try {
    const pythonCmd = process.platform === 'win32' ? 'python --version' : 'python3 --version';
    try {
      await execAsync(pythonCmd);
      logs.push('✓ Python is installed');
    } catch (e) {
      logs.push('✗ Python is not installed. Please install Python 3.8+ first.');
      return { success: false, logs: logs.join('\n') };
    }
    
    if (!(await fs.pathExists(venvPath))) {
      logs.push('Creating virtual environment...');
      const pythonExe = process.platform === 'win32' ? 'python' : 'python3';
      const venvCmd = `${pythonExe} -m venv "${venvPath}"`;
      
      try {
        await execAsync(venvCmd);
        logs.push('✓ Virtual environment created');
      } catch (e) {
        logs.push(`✗ Error creating virtual environment: ${e.message}`);
        return { success: false, logs: logs.join('\n') };
      }
    } else {
      logs.push('✓ Virtual environment already exists');
    }
    
    return { success: true, logs: logs.join('\n') };
  } catch (error) {
    logs.push(`✗ Error: ${error.message}`);
    return { success: false, logs: logs.join('\n') };
  }
});

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
      // For unsigned macOS apps, installation may fail - user needs to install manually
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

/**
 * Installs Python packages from requirements.txt into the virtual environment.
 * @returns {Promise<Object>} Result object with success status and logs.
 * @returns {boolean} returns.success - Whether installation succeeded.
 * @returns {string} returns.logs - Installation process logs.
 */
ipcMain.handle('install-python-packages', async () => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  const fs = require('fs-extra');
  
  const logs = [];
  const venvPath = getVenvPath();
  
  // In packaged apps, requirements.txt is in app.asar (read-only), so copy to userData
  let requirementsPath;
  if (app.isPackaged) {
    const userDataPath = app.getPath('userData');
    const tempRequirementsPath = path.join(userDataPath, 'requirements.txt');
    
    if (!(await fs.pathExists(tempRequirementsPath))) {
      try {
        const asarRequirementsPath = path.join(process.resourcesPath, 'app.asar', 'python', 'requirements.txt');
        const asarContent = await fs.readFile(asarRequirementsPath, 'utf8');
        await fs.writeFile(tempRequirementsPath, asarContent);
        logs.push('✓ Copied requirements.txt to user data directory');
      } catch (e) {
        const altPath = path.join(__dirname, '../../python/requirements.txt');
        if (await fs.pathExists(altPath)) {
          await fs.copy(altPath, tempRequirementsPath);
          logs.push('✓ Copied requirements.txt from alternative path');
        } else {
          logs.push(`✗ Could not find requirements.txt: ${e.message}`);
          return { success: false, logs: logs.join('\n') };
        }
      }
    }
    requirementsPath = tempRequirementsPath;
  } else {
    requirementsPath = path.join(__dirname, '../../python/requirements.txt');
  }
  
  try {
    if (!(await fs.pathExists(venvPath))) {
      logs.push('✗ Virtual environment not found. Please setup environment first.');
      return { success: false, logs: logs.join('\n') };
    }
    
    const pipPath = process.platform === 'win32'
      ? path.join(venvPath, 'Scripts', 'pip.exe')
      : path.join(venvPath, 'bin', 'pip');
    
    if (!(await fs.pathExists(pipPath))) {
      logs.push('✗ pip not found in virtual environment');
      return { success: false, logs: logs.join('\n') };
    }
    
    logs.push('Upgrading pip...');
    try {
      await execAsync(`"${pipPath}" install --upgrade pip`);
      logs.push('✓ pip upgraded');
    } catch (e) {
      logs.push(`⚠ Warning: Could not upgrade pip: ${e.message}`);
    }
    
    logs.push('Installing packages from requirements.txt...');
    try {
      const { stdout, stderr } = await execAsync(`"${pipPath}" install -r "${requirementsPath}"`);
      logs.push('✓ Packages installed successfully');
      if (stdout) logs.push(stdout);
      if (stderr) logs.push(stderr);
    } catch (e) {
      logs.push(`✗ Error installing packages: ${e.message}`);
      if (e.stdout) logs.push(e.stdout);
      if (e.stderr) logs.push(e.stderr);
      return { success: false, logs: logs.join('\n') };
    }
    
    return { success: true, logs: logs.join('\n') };
  } catch (error) {
    logs.push(`✗ Error: ${error.message}`);
    return { success: false, logs: logs.join('\n') };
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
    const fs = require('fs-extra');
    console.log('Merging three-step annotations:', { basePath, className, outputFolder });
    
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
    console.log(`Merged from folder 15: ${totalImages} images, ${totalLabels} labels`);
    
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
    console.log(`Merged from folder 35: ${totalImages} images, ${totalLabels} labels`);
    
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
    console.log(`Merged from folder 50: ${totalImages} images, ${totalLabels} labels`);
    
    console.log(`Total merged: ${totalImages} images, ${totalLabels} labels`);
    return { success: true, totalImages, totalLabels };
  } catch (error) {
    console.error('Error merging three-step annotations:', error);
    throw error;
  }
});