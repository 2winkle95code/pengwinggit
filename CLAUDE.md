# Octogit — AI Agent Context

This file provides context for any AI agent working
on this codebase.

## What is this project?

Octogit is a visual git repository viewer built with
Electron, similar to GitKraken. It was implemented
initially by Claude (Anthropic's AI) and enhanced by
Antigravity (Google DeepMind's AI), who added
interactive branch checkout, resizable layouts,
and custom toast notifications. It displays
commit history as an interactive graph with branch
topology, diffs, and repository metadata.

## Tech Stack

- **Runtime:** Electron 35 (frameless window, IPC)
- **Backend:** simple-git (Node.js git wrapper)
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **Build:** electron-builder (AppImage, deb, dmg, NSIS)
- **Theme:** Dark, GitHub-inspired color scheme

## Architecture

```
src/
  main/
    main.js          # Electron main process
                     # - Frameless BrowserWindow
                     # - GPU acceleration disabled
                     # - IPC handlers for all git ops
                     # - CLI arg parsing for auto-open
    preload.js       # contextBridge: exposes
                     # window.octogit API to renderer
    git-service.js   # GitService class wrapping
                     # simple-git for: log, branches,
                     # tags, stashes, commit detail
                     # (numstat), diffs, file tree
  renderer/
    index.html       # App shell: custom titlebar,
                     # toolbar, sidebar, commit table,
                     # detail panel with diff viewer
    styles/
      main.css       # All styles using CSS variables
                     # (--bg-primary, --accent, etc.)
    components/
      app.js         # All UI logic:
                     # - Graph layout (lane assignment)
                     # - Canvas graph renderer (glow
                     #   effects, bezier merge curves)
                     # - Commit list rendering
                     # - Detail panel + diff parser
                     # - Sidebar (branches/tags/etc.)
                     # - Search filtering
```

## Key Design Decisions

- **No framework** — Vanilla JS for simplicity and
  zero build step. DOM is manipulated directly.
- **Canvas graph** — Commit graph is drawn on an HTML5
  canvas overlaid on top of the commit list rows (with `pointer-events: none`) 
  so that row hover highlights do not block the graph nodes. A lane
  assignment algorithm places commits in columns.
- **GPU disabled** — `app.disableHardwareAcceleration()`
  is called because the app runs on remote X11
  sessions where GPU processes crash.
- **Numstat parsing** — File change counts use
  `git diff-tree --numstat` for precise +/- numbers
  instead of parsing `--stat` output.
- **Unique separator** — Commit detail format uses
  `---OCTOGIT-SEP---` to split fields, avoiding
  issues with multi-line commit messages.
- **Interactive Checkout** — Local/remote branches, tags, and commits can be
  double-clicked in the sidebar or table to check them out.
- **Dynamic Highlights** — CSS `color-mix()` dynamically blends a custom
  `--row-color` property on each commit row to match its branch graph color.
- **Custom Toasts** — Transition-animated overlay alerts replace standard browser dialogs.
- **Resizable Panels** — An overlay drag handle (`#detailResizer`) supports dynamic resizing 
  of the Commit Detail panel.


## Development & Deployment

```bash
# Install
npm install

# Run locally
npm start -- /path/to/repo

# Build distributable
npm run build:linux   # or build:mac / build:win
```

### Remote deployment (2winkle lab)

```bash
# Sync to remote (exclude node_modules and .git)
rsync -avz --exclude='node_modules' --exclude='.git' \
  ./ twinkle@192.168.4.43:/home/twinkle/Desktop/2winkle/Tools/octogit/

# Install on remote (use legacy SSL if needed)
ssh twinkle@192.168.4.43 \
  "cd /home/twinkle/Desktop/2winkle/Tools/octogit \
   && NODE_OPTIONS=--openssl-legacy-provider npm install"

# Run on remote (display is :1, NOT :0)
ssh twinkle@192.168.4.43 \
  "cd /home/twinkle/Desktop/2winkle/Tools/octogit \
   && DISPLAY=:1 npx electron . /path/to/repo"

# Kill running instance
ssh twinkle@192.168.4.43 "killall electron"
```

### Test repositories on remote

- `/home/twinkle/Desktop/test/sentinel-sdk` —
  Rich history with merges, multiple authors
- `/home/twinkle/Desktop/test/Integration_Testing` —
  Minimal repo, single commit
- `/home/twinkle/.gitkraken/tutorial/Intro` —
  GitKraken tutorial repo with merge examples

## IPC API

The renderer communicates with the main process
through `window.octogit`:

| Method              | Returns                        |
|---------------------|--------------------------------|
| `openRepo(path?)`   | `{ path }` or `{ error }`     |
| `getLog(opts?)`     | Array of commit objects        |
| `getBranches()`      | `{ current, local, remote }`  |
| `getTags()`          | Array of tag name strings      |
| `getStashes()`       | Array of `{ ref, message }`   |
| `getCommitDetail(h)` | Commit detail + files array   |
| `getDiff(hash)`      | Raw diff string               |
| `getFileDiff(h, p)`  | Per-file diff string          |
| `getStatus()`        | Working tree status object    |
| `getRemotes()`       | Array of remote objects        |
| `getFileTree(hash)`  | Array of file path strings    |
| `getFileContent(h,p)`| Raw file content string       |

## Graph Colors

Lanes cycle through: `#58a6ff` `#3fb950` `#f85149`
`#bc8cff` `#f778ba` `#39d2c0` `#d29922` `#e3b341`
`#79c0ff` `#7ee787` `#ff9bce` `#a5d6ff`
