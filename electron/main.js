const { app, BrowserWindow, shell, Menu, Tray, nativeImage, dialog, screen } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

// Load .env.local file manually
function loadEnvFile() {
  const basePath = app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..');

  const envPaths = [
    path.join(basePath, '.env.local'),
    path.join(basePath, '.env'),
    path.join(__dirname, '..', '.env.local'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      console.log('Loading env from:', envPath);
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const lines = envContent.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex);
            const value = trimmed.substring(eqIndex + 1);
            process.env[key] = value;
          }
        }
      }
      console.log('Env loaded, SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing');
      return true;
    }
  }

  console.warn('No .env.local file found');
  return false;
}

// Load environment variables early
loadEnvFile();

let mainWindow;
let tray;
let nextServer;
const PORT = 43721;
const isDev = !app.isPackaged;

// Get the correct base path for resources
function getBasePath() {
  if (app.isPackaged) {
    // In packaged app, resources are in Contents/Resources
    return path.join(process.resourcesPath, 'app.asar.unpacked');
  }
  return path.join(__dirname, '..');
}

function getAppPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }
  return path.join(__dirname, '..');
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const windowWidth = 1400;
  const windowHeight = 900;

  // Calculate center position
  const x = Math.round((screenWidth - windowWidth) / 2);
  const y = Math.round((screenHeight - windowHeight) / 2);

  console.log('Creating window at position:', x, y, 'screen size:', screenWidth, screenHeight);

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'icon.png'),
    show: false, // Don't show until ready
    backgroundColor: '#18181b', // Dark background while loading
  });

  // Show window when ready to show
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
    mainWindow.focus();
  });

  // Also force show after a timeout in case ready-to-show doesn't fire
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('Force showing window after timeout');
      mainWindow.show();
      mainWindow.focus();
    }
  }, 3000);

  // Load the app with retry
  const loadApp = (retries = 10) => {
    console.log('Attempting to load URL, retries left:', retries);
    mainWindow.loadURL(`http://localhost:${PORT}`).then(() => {
      console.log('URL loaded successfully');
    }).catch((err) => {
      console.error('Failed to load URL:', err.message);
      if (retries > 0) {
        console.log(`Retrying in 1 second... (${retries} retries left)`);
        setTimeout(() => loadApp(retries - 1), 1000);
      } else {
        console.log('All retries exhausted, showing error page');
        mainWindow.loadURL(`data:text/html,<html><body style="background:#1a1a1a;color:#fff;font-family:system-ui;padding:40px;"><h1>Unable to connect to server</h1><p>The Next.js server is not responding on port ${PORT}.</p><p>Please restart the app.</p></body></html>`);
      }
    });
  };

  loadApp();

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('file://')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Hide instead of close on macOS
  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Create tray icon (16x16 for macOS)
  const iconPath = path.join(__dirname, 'tray-icon.png');
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } catch (e) {
    // Fallback to empty icon if file doesn't exist
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Claude Hub');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Claude Hub',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function createMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            // Could open preferences window
          },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function startNextServer() {
  return new Promise((resolve, reject) => {
    const basePath = getAppPath();

    // Use standalone server.js for packaged app
    const standaloneServerPath = path.join(basePath, '.next', 'standalone', 'server.js');
    const legacyNextCliPath = path.join(basePath, 'node_modules', 'next', 'dist', 'bin', 'next');

    // Check which mode to use
    const useStandalone = fs.existsSync(standaloneServerPath);
    const serverPath = useStandalone ? standaloneServerPath : legacyNextCliPath;

    console.log('Base path:', basePath);
    console.log('Using standalone mode:', useStandalone);
    console.log('Server path:', serverPath);
    console.log('Server exists:', fs.existsSync(serverPath));

    // Find system Node.js - try common locations
    const nodePaths = [
      '/opt/homebrew/opt/node@20/bin/node',
      '/opt/homebrew/bin/node',
      '/usr/local/bin/node',
      '/usr/bin/node',
    ];

    let nodeExecutable = null;
    for (const nodePath of nodePaths) {
      if (fs.existsSync(nodePath)) {
        nodeExecutable = nodePath;
        break;
      }
    }

    if (!nodeExecutable) {
      console.error('Could not find system Node.js');
      dialog.showErrorBox('Error', 'Could not find Node.js. Please install Node.js and try again.');
      reject(new Error('Node.js not found'));
      return;
    }

    console.log('Using Node.js:', nodeExecutable);

    // Determine arguments and working directory based on mode
    let args, cwd;
    if (useStandalone) {
      args = [serverPath];
      cwd = path.join(basePath, '.next', 'standalone');
    } else {
      args = [serverPath, 'start', '-p', PORT.toString()];
      cwd = basePath;
    }

    nextServer = spawn(nodeExecutable, args, {
      cwd: cwd,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: PORT.toString(),
        HOSTNAME: 'localhost',
      },
      stdio: 'pipe',
    });

    let serverOutput = '';

    nextServer.stdout.on('data', (data) => {
      const output = data.toString();
      serverOutput += output;
      console.log('[Next.js]', output);
      if (output.includes('Ready') || output.includes(`localhost:${PORT}`) || output.includes('started server')) {
        resolve();
      }
    });

    nextServer.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      serverOutput += errorOutput;
      console.error('[Next.js Error]', errorOutput);
    });

    nextServer.on('error', (err) => {
      console.error('Failed to start Next.js server:', err);
      dialog.showErrorBox('Server Error', `Failed to start server: ${err.message}\n\nOutput: ${serverOutput}`);
      reject(err);
    });

    nextServer.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error('Next.js server exited with code:', code);
        dialog.showErrorBox('Server Error', `Server exited with code ${code}\n\nOutput: ${serverOutput}`);
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      console.log('Server startup timeout - proceeding anyway');
      resolve();
    }, 30000);
  });
}

function stopNextServer() {
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
}

app.whenReady().then(async () => {
  createMenu();
  createTray();

  if (isDev) {
    // In development, use the external `next dev` server started by npm script.
    console.log(`Dev mode: waiting for external Next.js server on http://localhost:${PORT}`);
  } else {
    // In production/package mode, Electron owns the Next.js server lifecycle.
    console.log('Starting Next.js server...');
    try {
      await startNextServer();
      console.log('Next.js server started successfully');

      // Wait a bit more for server to be fully ready
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (err) {
      console.error('Failed to start Next.js server:', err);
    }
  }

  // NOW create window after server is ready
  createWindow();

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopNextServer();
});

app.on('quit', () => {
  stopNextServer();
});
