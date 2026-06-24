# Octogit

A visual git repository viewer built with Electron.
Browse commit history, inspect diffs, and visualize
branch topology in a clean, dark-themed interface.

![Electron](https://img.shields.io/badge/Electron-35-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Commit graph** — Canvas-rendered branch topology
  with colored lanes, merge curves, and glow effects
- **Commit list** — Scrollable table with description,
  author, relative date, and short SHA
- **Ref badges** — Branch, tag, HEAD, and remote labels
  displayed inline on each commit row
- **Detail panel** — Full commit metadata, message body,
  and per-file addition/deletion counts
- **Diff viewer** — Syntax-highlighted unified diff with
  hunk headers and green/red line coloring
- **Sidebar** — Collapsible sections for local branches,
  remotes, tags, and stashes
- **Search** — Filter commits by message, author, or SHA
- **Open any repo** — File dialog or CLI argument

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Git](https://git-scm.com/) installed and on PATH
- npm (ships with Node.js)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/2winkle/octogit.git
cd octogit

# Install dependencies
npm install

# Run the app
npm start

# Or open a specific repository directly
npm start -- /path/to/your/repo
```

## Project Structure

```
octogit/
  src/
    main/
      main.js          # Electron main process
      preload.js       # Context bridge (IPC)
      git-service.js   # Git backend using simple-git
    renderer/
      index.html       # App shell
      styles/
        main.css       # All styles (dark theme)
      components/
        app.js         # UI logic, graph renderer
  package.json
```

## Build

Octogit uses
[electron-builder](https://www.electron.build/) to
produce distributable packages.

```bash
# Install dependencies (includes electron-builder)
npm install

# Build for your current platform
npm run build

# Or target a specific platform
npm run build:linux   # AppImage + .deb
npm run build:mac     # .dmg
npm run build:win     # NSIS installer
```

Build output is written to the `dist/` directory.

### Linux

```bash
npm run build:linux
# Produces:
#   dist/Octogit-1.0.0.AppImage
#   dist/octogit_1.0.0_amd64.deb
```

To install the `.deb`:

```bash
sudo dpkg -i dist/octogit_1.0.0_amd64.deb
```

### macOS

```bash
npm run build:mac
# Produces: dist/Octogit-1.0.0.dmg
```

### Windows

```bash
npm run build:win
# Produces: dist/Octogit Setup 1.0.0.exe
```

## Development

```bash
# Run in dev mode
npm run dev

# The app disables GPU acceleration by default for
# compatibility with remote X11 sessions. This has
# no effect on functionality.
```

### Remote / Headless Usage

Octogit works over SSH with X11 forwarding or on
remote desktops:

```bash
# On the remote machine
DISPLAY=:1 npm start -- /path/to/repo
```

## How It Works

1. **Main process** (`main.js`) creates a frameless
   BrowserWindow and registers IPC handlers for all
   git operations.

2. **Git service** (`git-service.js`) wraps
   [simple-git](https://github.com/steveukx/git-js)
   to run git commands: `log --all`, `diff-tree`,
   `show --numstat`, `branch -a`, `stash list`, etc.

3. **Preload** (`preload.js`) exposes a safe
   `window.octogit` API to the renderer via
   `contextBridge`.

4. **Renderer** (`app.js`) fetches data through the
   bridge, renders the commit list as DOM rows, and
   draws the branch graph on an HTML5 canvas with a
   lane-assignment algorithm.

## License

MIT
