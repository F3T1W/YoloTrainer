const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs-extra');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
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
    const imagesPath = path.join(datasetPath, 'images');
    await fs.ensureDir(imagesPath);
    const files = await fs.readdir(imagesPath);
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
    pythonProcess.stdout.on('data', (d) => {
      output += d.toString();
      if (mainWindow) mainWindow.webContents.send('download-progress', d.toString());
    });
    
    pythonProcess.stderr.on('data', (d) => {
      console.error(`Reddit Download Error: ${d}`);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: output });
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

ipcMain.handle('train-model', async (event, { datasetPath, epochs, batchSize, imgSize }) => {
  return new Promise((resolve, reject) => {
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(__dirname, '../../python/yolo_trainer.py');
    
    const pythonProcess = spawn(pythonPath, [
      scriptPath,
      '--data', datasetPath,
      '--epochs', epochs.toString(),
      '--batch', batchSize.toString(),
      '--img', imgSize.toString(),
      '--output', path.join(__dirname, '../../models')
    ]);

    let output = '';
    pythonProcess.stdout.on('data', (d) => {
      output += d.toString();
      if (mainWindow) mainWindow.webContents.send('training-progress', d.toString());
    });
    
    pythonProcess.stderr.on('data', (d) => {
      console.error(`Training Error: ${d}`);
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