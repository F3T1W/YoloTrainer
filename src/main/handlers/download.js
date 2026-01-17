const path = require('path');
const { spawn } = require('child_process');

// Download process state
let currentDownloadProcess = null;
let downloadPaused = false;
let downloadStopped = false;

/**
 * Registers download-related IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance.
 * @param {Electron.BrowserWindow} mainWindow - Main application window.
 */
function registerDownloadHandlers(ipcMain, mainWindow) {
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
      const scriptPath = path.join(__dirname, '../../../python/reddit_downloader.py');
      
      const outputPath = output_dir || path.join(__dirname, '../../../datasets/raw');
      
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
}

module.exports = { registerDownloadHandlers };
