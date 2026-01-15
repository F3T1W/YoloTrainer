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
  
  // Set feed URL for GitHub releases (only in production)
  if (process.env.NODE_ENV !== 'development' && !process.argv.includes('--dev')) {
    // Get owner and repo from package.json build.publish or repository.url
    const packageJson = require('../../package.json');
    let owner, repo;
    
    // First try to get from build.publish (more reliable)
    if (packageJson.build?.publish?.owner && packageJson.build?.publish?.repo) {
      owner = packageJson.build.publish.owner;
      repo = packageJson.build.publish.repo;
    } else {
      // Fallback to parsing repository URL
      const repoUrl = packageJson.repository?.url || '';
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\.git)?$/);
      if (match) {
        owner = match[1];
        repo = match[2].replace('.git', '');
      }
    }
    
    if (owner && repo) {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: owner,
        repo: repo
      });
      console.log(`Auto-updater configured for GitHub: ${owner}/${repo}`);
    } else {
      console.warn('Could not determine GitHub repository from package.json');
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
  
  // Start checking for updates only if updater is available
  if (updaterAvailable) {
    checkForUpdates();
    
    // Set up periodic update checks
    updateCheckTimer = setInterval(() => {
      checkForUpdates();
    }, UPDATE_CHECK_INTERVAL);
  }

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
    if (mainWindow) {
      mainWindow.webContents.send('update-error', err.message);
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
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version
      });
    }
  });
}

// IPC Handlers
ipcMain.handle('select-dataset-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('load-dataset', async (event, datasetPath) => {
  try {
    // Check if "images" folder exists
    const imagesPath = path.join(datasetPath, 'images');
    const hasImagesFolder = await fs.pathExists(imagesPath);
    
    let targetPath = datasetPath;
    if (hasImagesFolder) {
      targetPath = imagesPath;
    }
    
    // Read files from target path (either root or images folder)
    const files = await fs.readdir(targetPath);
    return files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  } catch (e) {
    return [];
  }
});

ipcMain.handle('download-reddit-images', async (event, { subreddit, limit, class_name, output_dir }) => {
  return new Promise((resolve, reject) => {
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(__dirname, '../../python/reddit_downloader.py');
    
    // Use provided output_dir or default to datasets/raw
    const outputPath = output_dir || path.join(__dirname, '../../datasets/raw');
    
    const pythonProcess = spawn(pythonPath, [
      scriptPath,
      '--subreddit', subreddit,
      '--limit', limit.toString(),
      '--class', class_name,
      '--output', outputPath
    ]);

    let output = '';
    let downloadedCount = 0;
    
    pythonProcess.stdout.on('data', (d) => {
      const data = d.toString();
      output += data;
      if (mainWindow) mainWindow.webContents.send('download-progress', data);
      
      // Try to extract downloaded count from output
      // Look for patterns like "Downloaded X/Y:" or "Download complete! X images"
      const match = data.match(/Downloaded\s+(\d+)\/(\d+):|Download complete!\s+(\d+)\s+images/);
      if (match) {
        downloadedCount = parseInt(match[1] || match[3] || 0);
      }
    });
    
    pythonProcess.stderr.on('data', (d) => {
      console.error(`Reddit Download Error: ${d}`);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        // If we couldn't extract from output, try to parse the last line
        if (downloadedCount === 0) {
          const lastLineMatch = output.match(/Download complete!\s+(\d+)\s+images/);
          if (lastLineMatch) {
            downloadedCount = parseInt(lastLineMatch[1]);
          } else {
            // Fallback: use limit as approximation
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

ipcMain.handle('get-default-temp-path', async () => {
  return path.join(__dirname, '../../datasets/temp');
});

ipcMain.handle('get-default-datasets-path', async () => {
  return path.join(__dirname, '../../datasets/raw');
});

ipcMain.handle('join-path', async (event, paths) => {
  return path.join(...paths);
});

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
    
    // Ensure base directory exists
    await fs.ensureDir(baseDir);
    console.log('Base directory ensured:', baseDir);
    
    // Create main class folder
    const classFolder = path.join(baseDir, className);
    await fs.ensureDir(classFolder);
    console.log('Class folder created:', classFolder);
    
    // Create subfolders with YOLO structure (images and labels)
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
    
    // Get all image files from source
    const files = await fs.readdir(sourceDir);
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    
    // Fixed distribution: 150, 350, rest (ideally 500)
    const count15 = 150;
    const count35 = 350;
    
    // Don't shuffle - images are already in correct order from download
    // (first 150, next 350, rest)
    
    // Copy to folder15 (first 150)
    for (let i = 0; i < count15 && i < imageFiles.length; i++) {
      const src = path.join(sourceDir, imageFiles[i]);
      const dest = path.join(folder15, 'images', imageFiles[i]);
      await fs.copy(src, dest);
    }
    
    // Copy to folder35 (next 350)
    for (let i = count15; i < count15 + count35 && i < imageFiles.length; i++) {
      const src = path.join(sourceDir, imageFiles[i]);
      const dest = path.join(folder35, 'images', imageFiles[i]);
      await fs.copy(src, dest);
    }
    
    // Copy to folder50 (remaining, ideally 500)
    for (let i = count15 + count35; i < imageFiles.length; i++) {
      const src = path.join(sourceDir, imageFiles[i]);
      const dest = path.join(folder50, 'images', imageFiles[i]);
      await fs.copy(src, dest);
    }
    
    const actualCount15 = Math.min(count15, imageFiles.length);
    const actualCount35 = Math.min(count35, Math.max(0, imageFiles.length - count15));
    const actualCount50 = Math.max(0, imageFiles.length - count15 - count35);
    
    // Clean up temp folder
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

ipcMain.handle('file-exists', async (event, filePath) => {
  try {
    return await fs.pathExists(filePath);
  } catch (e) {
    return false;
  }
});

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

ipcMain.handle('save-annotation', async (event, { imagePath, annotations, classNames }) => {
  try {
    const datasetDir = path.dirname(path.dirname(imagePath));
    const labelsDir = path.join(datasetDir, 'labels');
    await fs.ensureDir(labelsDir);
    
    const imageName = path.basename(imagePath, path.extname(imagePath));
    const labelPath = path.join(labelsDir, `${imageName}.txt`);
    
    // Convert to YOLO format: class_id center_x center_y width height (normalized)
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

ipcMain.handle('train-model', async (event, { datasetPath, epochs, batchSize, imgSize, classNames }) => {
  return new Promise((resolve, reject) => {
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(__dirname, '../../python/yolo_trainer.py');
    
    // Detect Apple Silicon (M1/M2/M3/M4)
    const isAppleSilicon = process.platform === 'darwin' && process.arch === 'arm64';
    
    // Optimize batch size for M4 (24GB unified memory can handle larger batches)
    let optimizedBatchSize = batchSize;
    let optimizedWorkers = 8; // Default workers
    
    if (isAppleSilicon) {
      // M4 with 24GB can handle larger batches
      // Optimize based on image size: larger images = smaller batch
      if (imgSize <= 416) {
        optimizedBatchSize = Math.min(batchSize * 2, 64); // Up to 64 for small images
        optimizedWorkers = 12; // More workers for faster data loading
      } else if (imgSize <= 640) {
        optimizedBatchSize = Math.min(batchSize * 1.5, 48); // Up to 48 for medium images
        optimizedWorkers = 10;
      } else {
        optimizedBatchSize = Math.min(batchSize, 32); // Keep original or max 32 for large images
        optimizedWorkers = 8;
      }
      
      console.log(`Apple Silicon detected! Optimized batch size: ${optimizedBatchSize}, workers: ${optimizedWorkers}`);
    }
    
    // Ensure classNames is an array and join it
    const classNamesStr = Array.isArray(classNames) ? classNames.join(',') : '';

    const pythonProcess = spawn(pythonPath, [
      scriptPath,
      '--data', datasetPath,
      '--epochs', epochs.toString(),
      '--batch', optimizedBatchSize.toString(),
      '--img', imgSize.toString(),
      '--output', path.join(__dirname, '../../models'),
      '--class-names', classNamesStr,
      '--workers', optimizedWorkers.toString(),
      '--device', isAppleSilicon ? 'mps' : 'auto' // Use MPS for Apple Silicon
    ]);

    let output = '';
    pythonProcess.stdout.on('data', (d) => {
      output += d.toString();
      if (mainWindow) mainWindow.webContents.send('training-progress', d.toString());
    });
    
    pythonProcess.stderr.on('data', (d) => {
      // YOLO outputs progress to stderr sometimes, so we want to see it too
      if (mainWindow) mainWindow.webContents.send('training-progress', d.toString());
      console.error(`Training Info: ${d}`);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        // After successful training, also copy best.pt to history with unique name
        setTimeout(async () => {
          try {
            const bestModelPath = path.join(__dirname, '../../models/custom_model/weights/best.pt');
            const historyDir = path.join(__dirname, '../../models/models_history');
            await fs.ensureDir(historyDir);
            
            if (await fs.pathExists(bestModelPath)) {
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
              const classNamesForFile = classNamesStr.split(',').slice(0, 3).join('_').replace(/\s+/g, '_').substring(0, 30);
              const uniqueName = `${timestamp}_${classNamesForFile}.pt`;
              const historyPath = path.join(historyDir, uniqueName);
              
              await fs.copy(bestModelPath, historyPath);
              console.log('Model saved to history:', historyPath);
            }
          } catch (e) {
            console.error('Error saving model to history:', e);
            // Don't fail training if history save fails
          }
        }, 1000);
        
        resolve({ success: true, message: output });
      } else {
        reject(new Error(`Training failed with code ${code}`));
      }
    });
  });
});

ipcMain.handle('export-model', async (event, { modelPath, outputPath }) => {
  // Copy model to CodeSlave project
  try {
    const targetPath = path.join(__dirname, '../../../CodeSlave/python_bridge/custom_models');
    await fs.ensureDir(targetPath);
    await fs.copy(modelPath, path.join(targetPath, path.basename(modelPath)));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    return '';
  }
});

ipcMain.handle('get-base-model-path', () => {
  return path.join(__dirname, '../../yolov8n.pt');
});

ipcMain.handle('get-trained-model-path', async () => {
  const modelPath = path.join(__dirname, '../../models/custom_model/weights/best.pt');
  try {
    if (await fs.pathExists(modelPath)) {
        return modelPath;
    }
  } catch(e) {}
  return null;
});

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

ipcMain.handle('select-file', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || []
  });
  return result.canceled ? null : result.filePaths[0];
});

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
           // Fallback if marker not found but exit 0, though predict.py ensures it prints it
           reject(new Error(`Prediction finished but no output path found. Output: ${output}`));
        } else {
           reject(new Error(`Prediction failed with code ${code}. Output: ${output}`));
        }
      }
    });
  });
});

// Copy folder handler
ipcMain.handle('copy-folder', async (event, { source, destination }) => {
  try {
    const fs = require('fs-extra');
    console.log('Copying folder from', source, 'to', destination);
    
    // Check if source exists
    const sourceExists = await fs.pathExists(source);
    if (!sourceExists) {
      console.log('Source folder does not exist:', source);
      return { success: false, error: 'Source folder does not exist' };
    }
    
    // Ensure destination parent directory exists
    const destParent = path.dirname(destination);
    await fs.ensureDir(destParent);
    
    // Remove destination if it exists (to avoid nested folders)
    if (await fs.pathExists(destination)) {
      await fs.remove(destination);
    }
    
    // Copy entire folder from source to destination
    await fs.copy(source, destination, { overwrite: true });
    
    console.log('Folder copied successfully');
    return { success: true };
  } catch (error) {
    console.error('Error copying folder:', error);
    throw error;
  }
});

// Remove folder handler
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

// Python Environment Handlers
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
    // Check Python
    const pythonCmd = process.platform === 'win32' ? 'python --version' : 'python3 --version';
    try {
      const { stdout } = await execAsync(pythonCmd);
      result.pythonInstalled = true;
      result.pythonVersion = stdout.trim();
    } catch (e) {
      result.pythonInstalled = false;
    }
    
    // Check virtual environment
    const venvPath = path.join(__dirname, '../../venv');
    result.venvExists = await fs.pathExists(venvPath);
    
    // Check packages if venv exists
    if (result.venvExists) {
      const pythonPath = process.platform === 'win32' 
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python3');
      
      if (await fs.pathExists(pythonPath)) {
        try {
          // Check if ultralytics is installed (main package)
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

ipcMain.handle('setup-python-environment', async () => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  const fs = require('fs-extra');
  
  const logs = [];
  const venvPath = path.join(__dirname, '../../venv');
  
  try {
    // Check if Python is installed
    const pythonCmd = process.platform === 'win32' ? 'python --version' : 'python3 --version';
    try {
      await execAsync(pythonCmd);
      logs.push('✓ Python is installed');
    } catch (e) {
      logs.push('✗ Python is not installed. Please install Python 3.8+ first.');
      return { success: false, logs: logs.join('\n') };
    }
    
    // Create virtual environment
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

// Update handlers (only if updater is available)
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

ipcMain.handle('install-update', async () => {
  if (!updaterAvailable || !autoUpdater) {
    return { success: false, error: 'Auto-updater not available. Install electron-updater package.' };
  }
  try {
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  } catch (error) {
    console.error('Error installing update:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-python-packages', async () => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  const fs = require('fs-extra');
  
  const logs = [];
  const venvPath = path.join(__dirname, '../../venv');
  const requirementsPath = path.join(__dirname, '../../python/requirements.txt');
  
  try {
    // Check if venv exists
    if (!(await fs.pathExists(venvPath))) {
      logs.push('✗ Virtual environment not found. Please setup environment first.');
      return { success: false, logs: logs.join('\n') };
    }
    
    // Get pip path
    const pipPath = process.platform === 'win32'
      ? path.join(venvPath, 'Scripts', 'pip.exe')
      : path.join(venvPath, 'bin', 'pip');
    
    if (!(await fs.pathExists(pipPath))) {
      logs.push('✗ pip not found in virtual environment');
      return { success: false, logs: logs.join('\n') };
    }
    
    // Upgrade pip
    logs.push('Upgrading pip...');
    try {
      await execAsync(`"${pipPath}" install --upgrade pip`);
      logs.push('✓ pip upgraded');
    } catch (e) {
      logs.push(`⚠ Warning: Could not upgrade pip: ${e.message}`);
    }
    
    // Install packages
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

// Merge three-step annotations handler
ipcMain.handle('merge-three-step-annotations', async (event, { basePath, className, outputFolder }) => {
  try {
    const fs = require('fs-extra');
    console.log('Merging three-step annotations:', { basePath, className, outputFolder });
    
    // Create output folder structure
    const outputImagesPath = path.join(outputFolder, 'images');
    const outputLabelsPath = path.join(outputFolder, 'labels');
    await fs.ensureDir(outputImagesPath);
    await fs.ensureDir(outputLabelsPath);
    
    // Folders to merge
    const folder15 = path.join(basePath, `${className}_15`);
    const folder35 = path.join(basePath, `${className}_35`);
    const folder50 = path.join(basePath, `${className}_50`);
    
    let totalImages = 0;
    let totalLabels = 0;
    
    // Merge from folder 15
    const folder15Images = path.join(folder15, 'images');
    const folder15Labels = path.join(folder15, 'labels');
    if (await fs.pathExists(folder15Images)) {
      const images = await fs.readdir(folder15Images);
      for (const img of images) {
        if (/\.(jpg|jpeg|png|webp)$/i.test(img)) {
          await fs.copy(path.join(folder15Images, img), path.join(outputImagesPath, img));
          totalImages++;
          
          // Copy corresponding label if exists
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
    
    // Merge from folder 35
    const folder35Images = path.join(folder35, 'images');
    const folder35Labels = path.join(folder35, 'labels');
    if (await fs.pathExists(folder35Images)) {
      const images = await fs.readdir(folder35Images);
      for (const img of images) {
        if (/\.(jpg|jpeg|png|webp)$/i.test(img)) {
          await fs.copy(path.join(folder35Images, img), path.join(outputImagesPath, img));
          totalImages++;
          
          // Copy corresponding label if exists
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
    
    // Merge from folder 50
    const folder50Images = path.join(folder50, 'images');
    const folder50Labels = path.join(folder50, 'labels');
    if (await fs.pathExists(folder50Images)) {
      const images = await fs.readdir(folder50Images);
      for (const img of images) {
        if (/\.(jpg|jpeg|png|webp)$/i.test(img)) {
          await fs.copy(path.join(folder50Images, img), path.join(outputImagesPath, img));
          totalImages++;
          
          // Copy corresponding label if exists
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