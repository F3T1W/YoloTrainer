const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs-extra');

let mainWindow;

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

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
    
    // Ensure classNames is an array and join it
    const classNamesStr = Array.isArray(classNames) ? classNames.join(',') : '';

    const pythonProcess = spawn(pythonPath, [
      scriptPath,
      '--data', datasetPath,
      '--epochs', epochs.toString(),
      '--batch', batchSize.toString(),
      '--img', imgSize.toString(),
      '--output', path.join(__dirname, '../../models'),
      '--class-names', classNamesStr
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

ipcMain.handle('file-exists', async (event, filePath) => {
  try {
    return await fs.pathExists(filePath);
  } catch (e) {
    return false;
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