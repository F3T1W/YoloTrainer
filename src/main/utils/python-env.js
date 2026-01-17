const path = require('path');
const { app } = require('electron');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs-extra');

/**
 * Get the path to Python virtual environment.
 * For packaged apps, uses userData directory (writable).
 * For development, uses local venv directory.
 * @returns {string} Path to the virtual environment directory.
 */
function getVenvPath() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'venv');
  } else {
    return path.join(__dirname, '../../../venv');
  }
}

/**
 * Get the Python command for the current platform.
 * @returns {string} Python command ('python' on Windows, 'python3' on Unix).
 */
function getPythonCommand() {
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Get the path to pip executable in the virtual environment.
 * @param {string} venvPath - Path to the virtual environment.
 * @returns {string} Path to pip executable.
 */
function getPipPath(venvPath) {
  return process.platform === 'win32'
    ? path.join(venvPath, 'Scripts', 'pip.exe')
    : path.join(venvPath, 'bin', 'pip');
}

/**
 * Get the path to Python executable in the virtual environment.
 * @param {string} venvPath - Path to the virtual environment.
 * @returns {string} Path to Python executable.
 */
function getPythonPath(venvPath) {
  return process.platform === 'win32'
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python3');
}

/**
 * Check if Python is installed on the system.
 * @returns {Promise<{installed: boolean, version: string|null}>} Python installation status and version.
 */
async function checkPythonInstalled() {
  try {
    const pythonCmd = getPythonCommand();
    const { stdout } = await execAsync(`${pythonCmd} --version`);
    return { installed: true, version: stdout.trim() };
  } catch (e) {
    return { installed: false, version: null };
  }
}

/**
 * Check if virtual environment exists.
 * @returns {Promise<boolean>} True if venv exists, false otherwise.
 */
async function checkVenvExists() {
  const venvPath = getVenvPath();
  return await fs.pathExists(venvPath);
}

/**
 * Check if required packages are installed in the virtual environment.
 * @param {string[]} packages - Array of package names to check.
 * @returns {Promise<boolean>} True if all packages are installed, false otherwise.
 */
async function checkPackagesInstalled(packages = ['ultralytics']) {
  const venvPath = getVenvPath();
  const pythonPath = getPythonPath(venvPath);
  
  if (!(await fs.pathExists(pythonPath))) {
    return false;
  }
  
  try {
    const importStatements = packages.map(pkg => `import ${pkg}`).join('; ');
    const { stdout } = await execAsync(`"${pythonPath}" -c "${importStatements}; print('OK')"`);
    return stdout.includes('OK');
  } catch (e) {
    return false;
  }
}

/**
 * Create Python virtual environment.
 * @returns {Promise<{success: boolean, logs: string[]}>} Result with success status and logs.
 */
async function createVenv() {
  const logs = [];
  const venvPath = getVenvPath();
  
  try {
    logs.push('Creating virtual environment...');
    const pythonExe = getPythonCommand();
    const venvCmd = `${pythonExe} -m venv "${venvPath}"`;
    
    await execAsync(venvCmd);
    logs.push('✓ Virtual environment created');
    return { success: true, logs };
  } catch (e) {
    logs.push(`✗ Error creating virtual environment: ${e.message}`);
    return { success: false, logs };
  }
}

/**
 * Upgrade pip in the virtual environment.
 * @returns {Promise<{success: boolean, logs: string[]}>} Result with success status and logs.
 */
async function upgradePip() {
  const logs = [];
  const venvPath = getVenvPath();
  const pipPath = getPipPath(venvPath);
  
  try {
    logs.push('Upgrading pip...');
    await execAsync(`"${pipPath}" install --upgrade pip`);
    logs.push('✓ pip upgraded');
    return { success: true, logs };
  } catch (e) {
    logs.push(`⚠ Warning: Could not upgrade pip: ${e.message}`);
    return { success: false, logs };
  }
}

/**
 * Install packages from requirements.txt into the virtual environment.
 * @param {string} requirementsPath - Path to requirements.txt file.
 * @returns {Promise<{success: boolean, logs: string[]}>} Result with success status and logs.
 */
async function installPackages(requirementsPath) {
  const logs = [];
  const venvPath = getVenvPath();
  const pipPath = getPipPath(venvPath);
  
  if (!(await fs.pathExists(pipPath))) {
    logs.push('✗ pip not found in virtual environment');
    return { success: false, logs };
  }
  
  try {
    logs.push('Installing packages from requirements.txt...');
    const { stdout, stderr } = await execAsync(`"${pipPath}" install -r "${requirementsPath}"`);
    logs.push('✓ Packages installed successfully');
    if (stdout) logs.push(stdout);
    if (stderr) logs.push(stderr);
    return { success: true, logs };
  } catch (e) {
    logs.push(`✗ Error installing packages: ${e.message}`);
    if (e.stdout) logs.push(e.stdout);
    if (e.stderr) logs.push(e.stderr);
    return { success: false, logs };
  }
}

/**
 * Get or copy requirements.txt file for packaged apps.
 * For packaged apps, requirements.txt is in app.asar (read-only), so we copy to userData.
 * @returns {Promise<{success: boolean, path: string|null, logs: string[]}>} Result with success status, path, and logs.
 */
async function getRequirementsPath() {
  const logs = [];
  
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
        const altPath = path.join(__dirname, '../../../python/requirements.txt');
        if (await fs.pathExists(altPath)) {
          await fs.copy(altPath, tempRequirementsPath);
          logs.push('✓ Copied requirements.txt from alternative path');
        } else {
          logs.push(`✗ Could not find requirements.txt: ${e.message}`);
          return { success: false, path: null, logs };
        }
      }
    }
    return { success: true, path: tempRequirementsPath, logs };
  } else {
    const devPath = path.join(__dirname, '../../../python/requirements.txt');
    return { success: true, path: devPath, logs };
  }
}

module.exports = {
  getVenvPath,
  getPythonCommand,
  getPipPath,
  getPythonPath,
  checkPythonInstalled,
  checkVenvExists,
  checkPackagesInstalled,
  createVenv,
  upgradePip,
  installPackages,
  getRequirementsPath
};
