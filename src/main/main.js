const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const GitService = require('./git-service');

// Disable GPU acceleration for compatibility with
// remote/headless environments
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch(
  'disable-software-rasterizer'
);

let mainWindow;
let gitService = null;
let gitWatcher = null;
let watchDebounceTimer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'PengwingGit',
    icon: path.join(__dirname, '..', 'renderer', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
  });

  mainWindow.loadFile(
    path.join(__dirname, '..', 'renderer', 'index.html')
  );
}

app.whenReady().then(() => {
  createWindow();

  // Auto-open repo if passed via command line
  const args = process.argv.slice(
    app.isPackaged ? 1 : 2
  );
  const repoArg = args.find(
    (a) => !a.startsWith('-') && !a.startsWith('--')
  );
  if (repoArg) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('auto-open', repoArg);
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC Handlers ─────────────────────────────────────

ipcMain.handle('open-repo', async (_event, repoPath) => {
  if (!repoPath) {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Open Git Repository',
    });
    if (result.canceled) return null;
    repoPath = result.filePaths[0];
  }
  gitService = new GitService(repoPath);
  const valid = await gitService.isRepo();
  if (!valid) return { error: 'Not a git repository' };

  // Start watching the repository for changes
  startWatchingRepo(repoPath);

  return { path: repoPath };
});

ipcMain.handle('get-log', async (_event, opts = {}) => {
  if (!gitService) return [];
  return gitService.getLog(opts);
});

ipcMain.handle('get-branches', async () => {
  if (!gitService) return { current: '', all: [], remote: [] };
  return gitService.getBranches();
});

ipcMain.handle('get-tags', async () => {
  if (!gitService) return [];
  return gitService.getTags();
});

ipcMain.handle('get-stashes', async () => {
  if (!gitService) return [];
  return gitService.getStashes();
});

ipcMain.handle('get-commit-detail', async (_event, hash) => {
  if (!gitService) return null;
  return gitService.getCommitDetail(hash);
});

ipcMain.handle('get-diff', async (_event, hash) => {
  if (!gitService) return '';
  return gitService.getDiff(hash);
});

ipcMain.handle('get-file-diff', async (_event, hash, filePath) => {
  if (!gitService) return '';
  return gitService.getFileDiff(hash, filePath);
});

ipcMain.handle('get-status', async () => {
  if (!gitService) return null;
  return gitService.getStatus();
});

ipcMain.handle('get-remotes', async () => {
  if (!gitService) return [];
  return gitService.getRemotes();
});

ipcMain.handle('checkout-branch', async (_event, branch) => {
  if (!gitService) return { error: 'No repo' };
  return gitService.checkoutBranch(branch);
});

ipcMain.handle('get-file-tree', async (_event, hash) => {
  if (!gitService) return [];
  return gitService.getFileTree(hash);
});

ipcMain.handle('get-file-content', async (_e, hash, fp) => {
  if (!gitService) return '';
  return gitService.getFileContent(hash, fp);
});

ipcMain.handle('get-workdir-diff', async (_event, filePath) => {
  if (!gitService) return '';
  return gitService.getWorkdirDiff(filePath);
});

ipcMain.handle('window-minimize', () => {
  mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('window-close', () => {
  mainWindow.close();
});

// ── Git Repository Watcher ───────────────────────────

function startWatchingRepo(repoPath) {
  // Stop any existing watcher
  stopWatchingRepo();

  const gitDir = path.join(repoPath, '.git');

  // Check if .git exists
  if (!fs.existsSync(gitDir)) {
    console.error('.git directory not found:', gitDir);
    return;
  }

  try {
    // Watch the .git directory for changes
    // We watch specific files/folders that indicate repo changes
    gitWatcher = fs.watch(
      gitDir,
      { recursive: true, persistent: true },
      (eventType, filename) => {
        // Ignore temporary files and editor artifacts
        if (!filename ||
            filename.includes('.lock') ||
            filename.includes('~') ||
            filename.startsWith('.#')) {
          return;
        }

        // Only trigger on relevant changes
        const relevantPaths = [
          'HEAD',           // Branch switches
          'refs/',          // Branch/tag updates
          'logs/',          // Commit history
          'objects/',       // New commits
          'index',          // Staging changes
          'FETCH_HEAD',     // Fetch operations
          'ORIG_HEAD',      // Merges/rebases
        ];

        const isRelevant = relevantPaths.some(p =>
          filename.startsWith(p) || filename === p
        );

        if (isRelevant) {
          // Debounce: multiple file changes happen in quick succession
          // Only trigger refresh after changes settle (500ms)
          clearTimeout(watchDebounceTimer);
          watchDebounceTimer = setTimeout(() => {
            console.log('Git change detected:', filename);
            notifyRepoChanged();
          }, 500);
        }
      }
    );

    gitWatcher.on('error', (error) => {
      console.error('Git watcher error:', error);
      stopWatchingRepo();
    });

    console.log('Started watching repository:', repoPath);
  } catch (error) {
    console.error('Failed to watch repository:', error);
  }
}

function stopWatchingRepo() {
  if (gitWatcher) {
    gitWatcher.close();
    gitWatcher = null;
  }
  if (watchDebounceTimer) {
    clearTimeout(watchDebounceTimer);
    watchDebounceTimer = null;
  }
}

function notifyRepoChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('repo-changed');
  }
}

// Clean up watcher on app quit
app.on('before-quit', () => {
  stopWatchingRepo();
});
