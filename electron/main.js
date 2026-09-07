const { app, BrowserWindow, dialog, ipcMain, shell, Menu, clipboard } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 8765;
const HOST = '127.0.0.1';
const SERVER_URL = `http://${HOST}:${PORT}/`;
let mainWindow = null;
let backend = null;
let shuttingDown = false;

function installContextMenu() {
  if (!mainWindow) return;
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = Menu.buildFromTemplate([
      ...(params.isEditable ? [
        { label: 'Undo', role: 'undo', enabled: params.editFlags.canUndo },
        { label: 'Redo', role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
        { label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll },
      ] : [
        { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll },
      ])
    ]);
    menu.popup({ window: mainWindow });
  });
}


function projectRoot() {
  return path.resolve(__dirname, '..');
}

function dataRoot() {
  return app.getPath('userData');
}

function toolsRoot() {
  return path.join(dataRoot(), 'tools');
}

function runtimePython() {
  return path.join(dataRoot(), 'runtime', 'python', 'python.exe');
}

function findPython() {
  const candidates = [
    runtimePython(),
    path.join(projectRoot(), 'runtime', 'python.exe')
  ];
  const local = candidates.find(fs.existsSync);
  return local || 'python';
}

function fileExists(p) {
  try { return fs.existsSync(p); } catch (_) { return false; }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: projectRoot(),
      windowsHide: true,
      ...options
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = (stderr || stdout || error.message || '').trim();
        reject(new Error(detail || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function ensureFile(url, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await run('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '${url}' -OutFile '${destination}'`
  ]);
}

async function ensurePrerequisites() {
  const root = projectRoot();
  const scripts = path.join(root, 'scripts');
  const tools = toolsRoot();
  const mutableRoot = dataRoot();
  const ytdlp = path.join(tools, 'yt-dlp.exe');
  const ffmpeg = path.join(tools, 'ffmpeg', 'bin', 'ffmpeg.exe');
  let python = findPython();

  fs.mkdirSync(path.join(mutableRoot, 'downloads'), { recursive: true });
  fs.mkdirSync(path.join(mutableRoot, 'logs'), { recursive: true });
  fs.mkdirSync(tools, { recursive: true });
  fs.mkdirSync(path.join(mutableRoot, 'runtime'), { recursive: true });

  // Phase 1.1 fix: Start-Electron.bat previously launched Python directly,
  // bypassing the V1 bootstrap steps. That left a fresh checkout without
  // yt-dlp/FFmpeg and made /api/analyze fail with no useful UI feedback.
  if (!fileExists(runtimePython())) {
    const bootstrap = path.join(scripts, 'bootstrap_python.bat');
    if (fileExists(bootstrap)) {
      await run('cmd.exe', ['/d', '/c', bootstrap], { env: { ...process.env, NOBI_DATA_ROOT: mutableRoot } });
      python = findPython();
    }
  }

  if (!fileExists(ytdlp)) {
    await ensureFile(
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
      ytdlp
    );
  }

  if (!fileExists(ffmpeg)) {
    const bootstrap = path.join(scripts, 'bootstrap_ffmpeg.bat');
    if (fileExists(bootstrap)) {
      await run('cmd.exe', ['/d', '/c', bootstrap], { env: { ...process.env, NOBI_DATA_ROOT: mutableRoot } });
    }
  }

  if (!fileExists(ytdlp)) {
    throw new Error(`yt-dlp was not installed at ${ytdlp}`);
  }
  if (!fileExists(ffmpeg)) {
    throw new Error(`FFmpeg was not installed at ${ffmpeg}`);
  }

  // Ensure FastAPI/Uvicorn are available for whichever Python is used.
  const requirements = path.join(root, 'app', 'requirements.txt');
  if (fileExists(requirements)) {
    await run(python, ['-m', 'pip', 'install', '-r', requirements,
      '--disable-pip-version-check', '-q']);
  }
}

function startBackend() {
  if (backend) return;

  const root = projectRoot();
  const python = findPython();
  const server = path.join(root, 'app', 'backend', 'server.py');

  backend = spawn(python, [server], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      NOBI_ELECTRON: '1',
      NOBI_PORT: String(PORT),
      NOBI_DATA_ROOT: dataRoot(),
      PYTHONUNBUFFERED: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  backend.stdout.on('data', data => console.log(`[Nobi backend] ${data}`));
  backend.stderr.on('data', data => console.error(`[Nobi backend] ${data}`));
  backend.on('error', err => {
    console.error('Backend failed to start:', err);
    if (!shuttingDown) {
      dialog.showErrorBox('NobiDownloader could not start',
        `The local download engine could not start.\n\n${err.message}`);
    }
  });
  backend.on('exit', (code, signal) => {
    console.log(`Backend exited: code=${code}, signal=${signal}`);
    backend = null;
    if (!shuttingDown && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox('NobiDownloader stopped',
        'The local download engine stopped unexpectedly. Please restart NobiDownloader.');
    }
  });
}

async function waitForBackend(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(SERVER_URL, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return true;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#f5f4ef',
    icon: path.join(__dirname, 'nobi.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  installContextMenu();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  try {
    await ensurePrerequisites();
    startBackend();

    const ready = await waitForBackend();
    if (!ready) {
      throw new Error('The local download engine did not become ready within 30 seconds. Check logs/server.log.');
    }

    await mainWindow.loadURL(SERVER_URL);
    mainWindow.show();
  } catch (error) {
    console.error(error);
    dialog.showErrorBox('NobiDownloader could not start', error.message);
    app.quit();
  }
}

async function stopBackend() {
  if (!backend) return;
  shuttingDown = true;
  const child = backend;
  backend = null;
  try { child.kill(); } catch (_) {}
  await new Promise(resolve => setTimeout(resolve, 300));
}

app.whenReady().then(async () => {
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', async event => {
  if (shuttingDown) return;
  event.preventDefault();
  await stopBackend();
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('app-version', () => app.getVersion());

ipcMain.handle('select-download-folder', () => {
  try {
    const result = dialog.showOpenDialogSync(mainWindow, {
      title: 'Choose NobiDownloader download folder',
      buttonLabel: 'Select Folder',
      defaultPath: app.getPath('downloads'),
      properties: ['openDirectory', 'createDirectory']
    });
    if (!result || !result.length) return { canceled: true, path: '' };
    return { canceled: false, path: result[0] };
  } catch (error) {
    console.error('select-download-folder failed:', error);
    return { canceled: false, path: '', error: error.message || String(error) };
  }
});
