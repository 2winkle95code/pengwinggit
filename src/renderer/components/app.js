/* ─────────────────────────────────────────────────
   Octogit — Renderer application
   ───────────────────────────────────────────────── */

const COLORS = [
  '#58a6ff', '#3fb950', '#f85149', '#bc8cff',
  '#f778ba', '#39d2c0', '#d29922', '#e3b341',
  '#79c0ff', '#7ee787', '#ff9bce', '#a5d6ff',
];

const ROW_H = 34;
const GRAPH_W = 160;
const NODE_R = 4;
const COL_W = 16;
const PAD_LEFT = 16;

let commits = [];
let branches = { current: '', local: [], remote: [] };
let tags = [];
let stashes = [];
let workdirStatus = null;
let selectedHash = null;
let selectedWorkdirFile = null;
let repoPath = null;
let searchTerm = '';
let viewMode = 'commits'; // 'commits' or 'workdir'

// ── DOM References ──────────────────────────────
const $welcome = document.getElementById('welcome');
const $graphView = document.getElementById('graphView');
const $commitList = document.getElementById('commitList');
const $canvas = document.getElementById('graphCanvas');
const $container =
  document.getElementById('commitListContainer');
const $detail = document.getElementById('detailPanel');
const $detailMeta = document.getElementById('detailMeta');
const $detailMsg = document.getElementById('detailMessage');
const $detailFiles = document.getElementById('detailFiles');
const $detailDiff = document.getElementById('detailDiff');
const $fileCount = document.getElementById('fileCount');
const $workdirList = document.getElementById('workdirList');
const $branchList = document.getElementById('branchList');
const $remoteList = document.getElementById('remoteList');
const $tagList = document.getElementById('tagList');
const $stashList = document.getElementById('stashList');
const $repoName = document.getElementById('repoName');
const $search = document.getElementById('searchInput');
const $resizer = document.getElementById('detailResizer');

// ── Window Controls ─────────────────────────────
document.getElementById('btnMin').onclick =
  () => window.octogit.windowMinimize();
document.getElementById('btnMax').onclick =
  () => window.octogit.windowMaximize();
document.getElementById('btnClose').onclick =
  () => window.octogit.windowClose();

// ── Open Repo ───────────────────────────────────
document.getElementById('btnOpenRepo').onclick = openRepo;
document.getElementById('btnWelcomeOpen').onclick = openRepo;
document.getElementById('btnRefresh').onclick = refresh;

// ── Detail Panel Resizing ────────────────────────
let isResizing = false;

$resizer.addEventListener('mousedown', (e) => {
  isResizing = true;
  $resizer.classList.add('resizing');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const startX = e.clientX;
  const startWidth = $detail.getBoundingClientRect().width;

  const onMouseMove = (moveEvent) => {
    if (!isResizing) return;
    const deltaX = moveEvent.clientX - startX;
    const newWidth = Math.max(280, startWidth - deltaX);
    const maxWidth = window.innerWidth * 0.8;
    $detail.style.width = Math.min(newWidth, maxWidth) + 'px';
  };

  const onMouseUp = () => {
    isResizing = false;
    $resizer.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
});

async function openRepo(path) {
  const target = typeof path === 'string' ? path : null;
  const result = await window.octogit.openRepo(target);
  if (!result || result.error) {
    if (result?.error) showToast(result.error, 'error');
    return;
  }
  repoPath = result.path;
  $repoName.textContent = `— ${repoPath}`;
  $welcome.hidden = true;
  $graphView.hidden = false;
  await refresh();
}

async function refresh() {
  if (!repoPath) return;
  const [log, br, tg, st, status] = await Promise.all([
    window.octogit.getLog(),
    window.octogit.getBranches(),
    window.octogit.getTags(),
    window.octogit.getStashes(),
    window.octogit.getStatus(),
  ]);
  commits = log;
  branches = br;
  tags = tg;
  stashes = st;
  workdirStatus = status;
  renderSidebar();
  renderCommitList();
  drawGraph();
}

// ── Sidebar ─────────────────────────────────────
function renderSidebar() {
  // Working Directory - just show count, not file list
  $workdirList.innerHTML = '';
  if (workdirStatus && !workdirStatus.isClean) {
    const fileCount = workdirStatus.files ? workdirStatus.files.length : 0;
    $workdirList.innerHTML = `<div class="workdir-summary">${fileCount} changed file${fileCount !== 1 ? 's' : ''}</div>`;
  } else {
    $workdirList.innerHTML = '<div class="workdir-summary">No changes</div>';
  }

  // Branches
  $branchList.innerHTML = '';
  for (const b of branches.local) {
    const el = document.createElement('div');
    el.className =
      'sidebar-item' + (b.current ? ' active' : '');
    const color = b.current
      ? 'var(--green)' : 'var(--text-muted)';
    el.innerHTML =
      `<span class="dot" style="background:${color}"></span>` +
      escHtml(b.name);
    el.onclick = () => scrollToBranch(b.name);
    el.ondblclick = () => checkoutBranch(b.name);
    el.title = "Double-click to checkout";
    $branchList.appendChild(el);
  }

  // Remotes
  $remoteList.innerHTML = '';
  for (const r of branches.remote) {
    const el = document.createElement('div');
    el.className = 'sidebar-item';
    const shortName = r.name.replace(/^remotes\//, '');
    el.textContent = shortName;
    el.onclick = () => scrollToBranch(shortName);
    el.ondblclick = () => checkoutRemoteBranch(r.name);
    el.title = "Double-click to checkout";
    $remoteList.appendChild(el);
  }

  // Tags
  $tagList.innerHTML = '';
  for (const t of tags) {
    const el = document.createElement('div');
    el.className = 'sidebar-item';
    el.innerHTML =
      `<span class="dot" style="background:var(--green)">` +
      `</span>${escHtml(t)}`;
    el.onclick = () => scrollToTag(t);
    el.ondblclick = () => checkoutCommit(t);
    el.title = "Double-click to checkout";
    $tagList.appendChild(el);
  }

  // Stashes
  $stashList.innerHTML = '';
  for (const s of stashes) {
    const el = document.createElement('div');
    el.className = 'sidebar-item';
    el.textContent = s.message;
    $stashList.appendChild(el);
  }
}

function scrollToBranch(name) {
  // Switch back to commits view when clicking a branch
  viewMode = 'commits';
  renderCommitList();
  drawGraph();

  const idx = commits.findIndex(
    (c) => c.refs && c.refs.includes(name)
  );
  if (idx >= 0) scrollToCommit(idx);
}

function scrollToTag(name) {
  // Switch back to commits view when clicking a tag
  viewMode = 'commits';
  renderCommitList();
  drawGraph();

  const idx = commits.findIndex(
    (c) => c.refs && c.refs.includes(`tag: ${name}`)
  );
  if (idx >= 0) scrollToCommit(idx);
}

function showWorkingDirectoryView() {
  viewMode = 'workdir';
  selectedHash = null;
  selectedWorkdirFile = null;

  // Clear commit selections
  document.querySelectorAll('.commit-row').forEach((r) =>
    r.classList.remove('selected')
  );

  // Hide detail panel
  $detail.hidden = true;
  $resizer.hidden = true;

  renderCommitList();
  drawGraph();
}

function scrollToCommit(idx) {
  $container.scrollTop = idx * ROW_H;
}

// ── Sidebar Collapsing & Working Directory Click ───
document.querySelectorAll('.section-header').forEach((h) => {
  h.addEventListener('click', () => {
    // Special handling for working directory - switch to workdir view
    if (h.dataset.toggle === 'workdir') {
      showWorkingDirectoryView();
      return;
    }

    // Normal collapse/expand behavior for other sections
    h.classList.toggle('collapsed');
    const body = h.nextElementSibling;
    body.classList.toggle('collapsed');
  });
});

// ── Search ──────────────────────────────────────
$search.addEventListener('input', (e) => {
  searchTerm = e.target.value.toLowerCase();
  renderCommitList();
  drawGraph();
});

// ── Graph Layout Algorithm ──────────────────────
// Assigns each commit a column (lane). Children pass
// their lane to the first parent; merge parents get
// a new or reused lane.
function layoutGraph(commits) {
  const lanes = [];       // col → hash that "owns" it
  const commitCol = {};   // hash → col
  const commitIdx = {};   // hash → row

  commits.forEach((c, i) => { commitIdx[c.hash] = i; });

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];

    // 1) Has a lane already been reserved for us?
    let col = -1;
    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] === c.hash) {
        col = l;
        break;
      }
    }

    // 2) No reservation → take first free lane or add one
    if (col === -1) {
      const free = lanes.indexOf(null);
      col = free !== -1 ? free : lanes.length;
      if (col === lanes.length) lanes.push(null);
    }
    commitCol[c.hash] = col;

    // 3) First parent inherits our lane
    if (c.parents.length > 0) {
      const p0 = c.parents[0];
      // Only reserve if the parent isn't already placed
      if (commitCol[p0] === undefined) {
        lanes[col] = p0;
      } else {
        lanes[col] = null; // free the lane
      }
    } else {
      lanes[col] = null;
    }

    // 4) Additional parents (merge sources) get their
    //    own lane if not already placed or reserved
    for (let p = 1; p < c.parents.length; p++) {
      const ph = c.parents[p];
      if (commitCol[ph] !== undefined) continue;
      let reserved = false;
      for (let l = 0; l < lanes.length; l++) {
        if (lanes[l] === ph) { reserved = true; break; }
      }
      if (!reserved) {
        const free = lanes.indexOf(null);
        if (free !== -1) {
          lanes[free] = ph;
        } else {
          lanes.push(ph);
        }
      }
    }
  }

  return { commitCol, commitIdx };
}

// ── Draw Commit Graph on Canvas ─────────────────
function drawGraph() {
  // Hide canvas in workdir view
  if (viewMode === 'workdir') {
    $canvas.style.display = 'none';
    return;
  }

  $canvas.style.display = 'block';
  const filtered = getFilteredCommits();
  if (!filtered.length) return;
  const { commitCol} = layoutGraph(filtered);

  const dpr = window.devicePixelRatio || 1;
  const w = GRAPH_W;
  const h = filtered.length * ROW_H;

  $canvas.width = w * dpr;
  $canvas.height = h * dpr;
  $canvas.style.width = w + 'px';
  $canvas.style.height = h + 'px';

  const ctx = $canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  // Build hash→row for filtered set
  const hashRow = {};
  filtered.forEach((c, i) => { hashRow[c.hash] = i; });

  const colColor = (col) => COLORS[col % COLORS.length];

  // ── Pass 1: Draw edges ────────────────────────
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i];
    const col = commitCol[c.hash] ?? 0;
    const x = PAD_LEFT + col * COL_W;
    const y = i * ROW_H + ROW_H / 2;

    for (let pi = 0; pi < c.parents.length; pi++) {
      const ph = c.parents[pi];
      const pRow = hashRow[ph];
      if (pRow === undefined) continue;
      const pCol = commitCol[ph] ?? 0;
      const px = PAD_LEFT + pCol * COL_W;
      const py = pRow * ROW_H + ROW_H / 2;

      // Use parent color for merge edges,
      // child color for first-parent edges
      const edgeCol = pi === 0 ? col : pCol;
      const color = colColor(edgeCol);

      // Glow layer
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.15;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      drawEdge(ctx, x, y, px, py, col === pCol);
      ctx.stroke();

      // Main line
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      drawEdge(ctx, x, y, px, py, col === pCol);
      ctx.stroke();
    }
  }

  // ── Pass 2: Draw nodes on top ─────────────────
  ctx.globalAlpha = 1.0;
  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i];
    const col = commitCol[c.hash] ?? 0;
    const x = PAD_LEFT + col * COL_W;
    const y = i * ROW_H + ROW_H / 2;
    const color = colColor(col);

    // Outer glow
    ctx.beginPath();
    ctx.arc(x, y, NODE_R + 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.2;
    ctx.fill();

    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.arc(x, y, NODE_R, 0, Math.PI * 2);

    if (c.parents.length > 1) {
      // Merge commit: ring style
      ctx.fillStyle = '#0d1117';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}

function drawEdge(ctx, x1, y1, x2, y2, straight) {
  if (straight) {
    ctx.lineTo(x2, y2);
  } else if (y2 > y1) {
    // Branch going down: curve out then straight
    const stepY = Math.min(ROW_H, (y2 - y1) * 0.5);
    ctx.bezierCurveTo(
      x1, y1 + stepY,
      x2, y2 - stepY,
      x2, y2
    );
  } else {
    ctx.lineTo(x2, y2);
  }
}

// ── Render Commit List ──────────────────────────
function getFilteredCommits() {
  if (!searchTerm) return commits;
  return commits.filter(
    (c) =>
      c.message.toLowerCase().includes(searchTerm) ||
      c.author.toLowerCase().includes(searchTerm) ||
      c.hash.toLowerCase().startsWith(searchTerm)
  );
}

function renderCommitList() {
  $commitList.innerHTML = '';

  if (viewMode === 'workdir') {
    // Show working directory files
    renderWorkdirFiles();
    return;
  }

  // Show commits (normal view)
  const filtered = getFilteredCommits();
  const { commitCol } = layoutGraph(filtered);
  const colColor = (col) => COLORS[col % COLORS.length];

  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i];
    const row = document.createElement('div');
    row.className =
      'commit-row' +
      (c.hash === selectedHash ? ' selected' : '');
    row.dataset.hash = c.hash;

    const col = commitCol[c.hash] ?? 0;
    const color = colColor(col);
    row.style.setProperty('--row-color', color);

    // Graph spacer (canvas draws behind)
    const graphCell = document.createElement('div');
    graphCell.className = 'cr-graph';
    row.appendChild(graphCell);

    // Description + ref badges
    const desc = document.createElement('div');
    desc.className = 'cr-desc';

    // Parse refs
    if (c.refs) {
      const refParts = c.refs.split(',').map((r) => r.trim());
      for (const ref of refParts) {
        if (!ref) continue;
        const badge = document.createElement('span');
        if (ref === 'HEAD') {
          badge.className = 'ref-badge head';
          badge.textContent = 'HEAD';
        } else if (ref.startsWith('HEAD -> ')) {
          badge.className = 'ref-badge head';
          badge.textContent = ref.replace('HEAD -> ', '');
        } else if (ref.startsWith('tag: ')) {
          badge.className = 'ref-badge tag';
          badge.textContent = ref.replace('tag: ', '');
        } else if (ref.startsWith('origin/')) {
          badge.className = 'ref-badge remote';
          badge.textContent = ref;
        } else {
          badge.className = 'ref-badge branch';
          badge.textContent = ref;
        }
        desc.appendChild(badge);
      }
    }

    const msg = document.createElement('span');
    msg.className = 'msg';
    msg.textContent = c.message;
    desc.appendChild(msg);
    row.appendChild(desc);

    // Author
    const author = document.createElement('div');
    author.className = 'cr-author';
    author.textContent = c.author;
    row.appendChild(author);

    // Date
    const date = document.createElement('div');
    date.className = 'cr-date';
    date.textContent = formatDate(c.date);
    row.appendChild(date);

    // Hash
    const hash = document.createElement('div');
    hash.className = 'cr-hash';
    hash.textContent = c.hash.substring(0, 7);
    row.appendChild(hash);

    row.onclick = () => selectCommit(c.hash);
    row.ondblclick = () => checkoutCommit(c.hash);
    row.title = "Double-click to checkout commit (detaches HEAD)";
    $commitList.appendChild(row);
  }
}

function renderWorkdirFiles() {
  if (!workdirStatus || workdirStatus.isClean) {
    $commitList.innerHTML = '<div class="empty-state">No changes in working directory</div>';
    return;
  }

  const files = workdirStatus.files || [];

  for (const file of files) {
    const row = document.createElement('div');
    row.className = 'workdir-file-row' + (selectedWorkdirFile === file.path ? ' selected' : '');

    // Status label with staged indicator
    const statusLabel = file.staged ? `${file.status}*` : file.status;
    const statusText = file.staged ? 'Staged' : 'Unstaged';

    row.innerHTML = `
      <div class="wf-status ${file.status}" title="${statusText}">${statusLabel}</div>
      <div class="wf-path" title="${escHtml(file.path)}">${escHtml(file.path)}</div>
      <div class="wf-type">${file.staged ? 'Staged' : 'Modified'}</div>
    `;

    row.onclick = () => selectWorkdirFile(file.path, file.status);
    $commitList.appendChild(row);
  }
}

async function selectWorkdirFile(filePath, status) {
  selectedWorkdirFile = filePath;
  selectedHash = null;

  // Update selection in list
  document.querySelectorAll('.workdir-file-row').forEach((r) =>
    r.classList.remove('selected')
  );
  document.querySelectorAll(`.workdir-file-row`).forEach((r) => {
    if (r.querySelector('.wf-path').textContent === filePath) {
      r.classList.add('selected');
    }
  });

  // Show detail panel
  $detail.hidden = false;
  $resizer.hidden = false;

  // Set header
  $detailMeta.innerHTML = `
    <span class="label">File</span>
    <span class="value mono">${escHtml(filePath)}</span>
    <span class="label">Status</span>
    <span class="value">${status === 'M' ? 'Modified' :
                        status === 'A' ? 'Added/Staged' :
                        status === 'D' ? 'Deleted' :
                        status === 'U' ? 'Untracked' :
                        status === 'R' ? 'Renamed' : 'Changed'}</span>
  `;

  $detailMsg.textContent = 'Uncommitted changes in working directory';
  $detailFiles.innerHTML = '';
  $fileCount.textContent = '';

  // Get diff for working directory file
  const diff = await window.octogit.getWorkdirDiff(filePath);
  renderDiff(diff);
}

// ── Select Commit & Show Detail ─────────────────
async function selectCommit(hash) {
  selectedHash = hash;

  // Update selection in list
  document.querySelectorAll('.commit-row').forEach((r) => {
    r.classList.toggle('selected', r.dataset.hash === hash);
  });

  // Show detail panel & resizer
  $detail.hidden = false;
  $resizer.hidden = false;

  // Load detail
  const [detail, diff] = await Promise.all([
    window.octogit.getCommitDetail(hash),
    window.octogit.getDiff(hash),
  ]);

  if (!detail) return;

  // Meta
  $detailMeta.innerHTML = `
    <span class="label">SHA</span>
    <span class="value mono">${escHtml(detail.hash)}</span>
    <span class="label">Author</span>
    <span class="value">${escHtml(detail.author)}
      &lt;${escHtml(detail.authorEmail)}&gt;</span>
    <span class="label">Date</span>
    <span class="value">${formatDateFull(detail.authorDate)}</span>
    ${detail.parents.length ? `
    <span class="label">Parents</span>
    <span class="value mono">${detail.parents
      .map((p) => escHtml(p.substring(0, 7)))
      .join(', ')}</span>
    ` : ''}
  `;

  // Message
  $detailMsg.textContent = detail.body;

  // Files from numstat
  const files = detail.files || [];
  $fileCount.textContent = `${files.length} files`;

  $detailFiles.innerHTML = '';
  $detailDiff.innerHTML = '';

  for (const f of files) {
    const el = document.createElement('div');
    el.className = 'file-item';
    el.innerHTML = `
      <span class="file-status ${f.status}">
        ${f.status}</span>
      <span class="file-name">${escHtml(f.path)}</span>
      <span class="file-stat">
        ${f.additions
          ? `<span class="add">+${f.additions}</span>` : ''}
        ${f.deletions
          ? ` <span class="del">-${f.deletions}</span>` : ''}
      </span>
    `;
    el.onclick = () => showFileDiff(hash, f.path, el);
    $detailFiles.appendChild(el);
  }

  // Show full diff
  if (diff) renderDiff(diff);
}

async function showFileDiff(hash, filePath, el) {
  document.querySelectorAll('.file-item').forEach((f) =>
    f.classList.remove('selected')
  );
  el.classList.add('selected');

  const diff = await window.octogit.getFileDiff(
    hash, filePath
  );
  renderDiff(diff);
}

function renderDiff(diffText) {
  $detailDiff.innerHTML = '';
  if (!diffText) return;

  const lines = diffText.split('\n');
  let container = null;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const hunk = document.createElement('div');
      hunk.className = 'diff-hunk-header';
      hunk.textContent = line;
      $detailDiff.appendChild(hunk);
      container = $detailDiff;
    } else if (container) {
      const dl = document.createElement('div');
      let cls = 'ctx';
      if (line.startsWith('+')) cls = 'add';
      else if (line.startsWith('-')) cls = 'del';

      dl.className = `diff-line ${cls}`;
      dl.innerHTML =
        `<span class="code">${escHtml(line)}</span>`;
      container.appendChild(dl);
    }
  }
}

// ── Close Detail ────────────────────────────────
document.getElementById('btnCloseDetail').onclick = () => {
  $detail.hidden = true;
  $resizer.hidden = true;
  selectedHash = null;
  document.querySelectorAll('.commit-row').forEach(
    (r) => r.classList.remove('selected')
  );
};

// ── Checkout Actions ────────────────────────────
async function checkoutBranch(name) {
  showToast(`Checking out branch "${name}"...`, 'info');
  try {
    const res = await window.octogit.checkoutBranch(name);
    if (res && res.success) {
      showToast(`Checked out branch "${name}" successfully`, 'success');
      await refresh();
    } else {
      showToast(`Error: ${res.error || 'Failed to checkout branch'}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function checkoutRemoteBranch(remoteName) {
  const cleanName = remoteName.replace(/^remotes\/[^\/]+\//, '');
  const localExists = branches.local.some(b => b.name === cleanName);
  
  if (localExists) {
    await checkoutBranch(cleanName);
  } else {
    showToast(`Checking out remote branch "${remoteName}" as local "${cleanName}"...`, 'info');
    try {
      const res = await window.octogit.checkoutBranch(cleanName);
      if (res && res.success) {
        showToast(`Created and checked out local branch "${cleanName}" tracking "${remoteName}"`, 'success');
        await refresh();
      } else {
        showToast(`Could not auto-track remote branch. Detaching HEAD at "${remoteName}"...`, 'warning');
        const res2 = await window.octogit.checkoutBranch(remoteName);
        if (res2 && res2.success) {
          showToast(`Checked out "${remoteName}" (Detached HEAD)`, 'success');
          await refresh();
        } else {
          showToast(`Error: ${res2.error || 'Failed to checkout'}`, 'error');
        }
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  }
}

async function checkoutCommit(hash) {
  const shortHash = hash.substring(0, 7);
  showToast(`Checking out commit ${shortHash} (detaching HEAD)...`, 'info');
  try {
    const res = await window.octogit.checkoutBranch(hash);
    if (res && res.success) {
      showToast(`Checked out commit ${shortHash} (Detached HEAD)`, 'warning');
      await refresh();
    } else {
      showToast(`Error: ${res.error || 'Failed to checkout commit'}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ── Working Directory File Diff ─────────────────
async function showWorkdirFileDiff(filePath, status, el) {
  selectedWorkdirFile = filePath;
  selectedHash = null;

  // Update selection
  document.querySelectorAll('.workdir-item').forEach((item) =>
    item.classList.remove('selected')
  );
  if (el) el.classList.add('selected');

  // Clear commit row selections
  document.querySelectorAll('.commit-row').forEach((r) =>
    r.classList.remove('selected')
  );

  // Show detail panel
  $detail.hidden = false;
  $resizer.hidden = false;

  // Set header
  $detailMeta.innerHTML = `
    <span class="label">File</span>
    <span class="value mono">${escHtml(filePath)}</span>
    <span class="label">Status</span>
    <span class="value">${status === 'M' ? 'Modified' :
                        status === 'A' ? 'Added/Staged' :
                        status === 'D' ? 'Deleted' :
                        status === 'U' ? 'Untracked' :
                        status === 'R' ? 'Renamed' : 'Changed'}</span>
  `;

  $detailMsg.textContent = 'Uncommitted changes in working directory';
  $detailFiles.innerHTML = '';
  $fileCount.textContent = '';

  // Get diff for working directory file
  const diff = await window.octogit.getWorkdirDiff(filePath);
  renderDiff(diff);
}

// ── Toast System ────────────────────────────────
const $toastContainer = document.getElementById('toastContainer');

function showToast(message, type = 'info') {
  if (!$toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg width="14" height="14" viewBox="0 0 16 16" fill="var(--green)"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg width="14" height="14" viewBox="0 0 16 16" fill="var(--red)"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8 4a.905.905 0 0 0-.9.995l.35 3.507a.552.552 0 0 0 1.1 0l.35-3.507A.905.905 0 0 0 8 4zm.002 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>`;
  } else if (type === 'warning') {
    iconSvg = `<svg width="14" height="14" viewBox="0 0 16 16" fill="var(--orange)"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>`;
  } else {
    iconSvg = `<svg width="14" height="14" viewBox="0 0 16 16" fill="var(--accent)"><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>`;
  }

  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-message">${escHtml(message)}</div>
  `;
  
  $toastContainer.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 4000);
}

// ── Helpers ─────────────────────────────────────
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 365) {
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    });
  }
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateFull(iso) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ── Canvas Resize ───────────────────────────────
const resizeObs = new ResizeObserver(() => {
  if (commits.length) drawGraph();
});
resizeObs.observe($container);

// ── Auto-open repo from main process ────────────
window.octogit.onAutoOpen((repoPath) => {
  openRepo(repoPath);
});

// ── Live repository change detection ────────────
window.octogit.onRepoChanged(() => {
  console.log('Repository changed, refreshing...');
  refresh();
});
