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
let selectedHash = null;
let repoPath = null;
let searchTerm = '';

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
const $branchList = document.getElementById('branchList');
const $remoteList = document.getElementById('remoteList');
const $tagList = document.getElementById('tagList');
const $stashList = document.getElementById('stashList');
const $repoName = document.getElementById('repoName');
const $search = document.getElementById('searchInput');

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

async function openRepo(path) {
  const target = typeof path === 'string' ? path : null;
  const result = await window.octogit.openRepo(target);
  if (!result || result.error) {
    if (result?.error) alert(result.error);
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
  const [log, br, tg, st] = await Promise.all([
    window.octogit.getLog(),
    window.octogit.getBranches(),
    window.octogit.getTags(),
    window.octogit.getStashes(),
  ]);
  commits = log;
  branches = br;
  tags = tg;
  stashes = st;
  renderSidebar();
  renderCommitList();
  drawGraph();
}

// ── Sidebar ─────────────────────────────────────
function renderSidebar() {
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
    $branchList.appendChild(el);
  }

  // Remotes
  $remoteList.innerHTML = '';
  for (const r of branches.remote) {
    const el = document.createElement('div');
    el.className = 'sidebar-item';
    el.textContent = r.name.replace(/^remotes\//, '');
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
  const idx = commits.findIndex(
    (c) => c.refs && c.refs.includes(name)
  );
  if (idx >= 0) scrollToCommit(idx);
}

function scrollToTag(name) {
  const idx = commits.findIndex(
    (c) => c.refs && c.refs.includes(`tag: ${name}`)
  );
  if (idx >= 0) scrollToCommit(idx);
}

function scrollToCommit(idx) {
  $container.scrollTop = idx * ROW_H;
}

// ── Sidebar Collapsing ──────────────────────────
document.querySelectorAll('.section-header').forEach((h) => {
  h.addEventListener('click', () => {
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
function layoutGraph(commits) {
  // Assign each commit a column (lane)
  const lanes = [];        // column → last hash occupying
  const commitCol = {};    // hash → column
  const commitIdx = {};    // hash → row index

  commits.forEach((c, i) => {
    commitIdx[c.hash] = i;
  });

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    if (commitCol[c.hash] !== undefined) continue;

    // Try to find a lane from a child already placed
    let col = -1;

    // Find if any parent from a previous commit is us
    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] === c.hash) {
        col = l;
        break;
      }
    }

    if (col === -1) {
      // New lane
      col = lanes.length;
      lanes.push(null);
    }

    commitCol[c.hash] = col;

    // Route first parent down the same lane
    if (c.parents.length > 0) {
      lanes[col] = c.parents[0];
    } else {
      lanes[col] = null;
    }

    // Additional parents get new or reuse lanes
    for (let p = 1; p < c.parents.length; p++) {
      const ph = c.parents[p];
      if (commitCol[ph] !== undefined) continue;
      // Check if already reserved in a lane
      let found = false;
      for (let l = 0; l < lanes.length; l++) {
        if (lanes[l] === ph) { found = true; break; }
      }
      if (!found) {
        lanes.push(ph);
      }
    }
  }

  return { commitCol, commitIdx };
}

// ── Draw Commit Graph on Canvas ─────────────────
function drawGraph() {
  const filtered = getFilteredCommits();
  const { commitCol } = layoutGraph(filtered);
  const maxCol = Math.max(
    0, ...Object.values(commitCol)
  );

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

  // Draw edges first
  ctx.lineWidth = 2;
  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i];
    const col = commitCol[c.hash] || 0;
    const x = PAD_LEFT + col * COL_W;
    const y = i * ROW_H + ROW_H / 2;

    for (const ph of c.parents) {
      const pRow = hashRow[ph];
      if (pRow === undefined) continue;
      const pCol = commitCol[ph] || 0;
      const px = PAD_LEFT + pCol * COL_W;
      const py = pRow * ROW_H + ROW_H / 2;

      const color = COLORS[col % COLORS.length];
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);

      if (col === pCol) {
        // Straight line
        ctx.lineTo(px, py);
      } else {
        // Curved merge/branch line
        const midY = y + (py - y) * 0.4;
        ctx.bezierCurveTo(x, midY, px, midY, px, py);
      }
      ctx.stroke();
    }
  }

  // Draw nodes on top
  ctx.globalAlpha = 1.0;
  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i];
    const col = commitCol[c.hash] || 0;
    const x = PAD_LEFT + col * COL_W;
    const y = i * ROW_H + ROW_H / 2;
    const color = COLORS[col % COLORS.length];

    // Node circle
    ctx.beginPath();
    ctx.arc(x, y, NODE_R, 0, Math.PI * 2);

    if (c.parents.length > 1) {
      // Merge commit: filled ring
      ctx.fillStyle = 'var(--bg-primary)';
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
  const filtered = getFilteredCommits();
  $commitList.innerHTML = '';

  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i];
    const row = document.createElement('div');
    row.className =
      'commit-row' +
      (c.hash === selectedHash ? ' selected' : '');
    row.dataset.hash = c.hash;

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
    $commitList.appendChild(row);
  }
}

// ── Select Commit & Show Detail ─────────────────
async function selectCommit(hash) {
  selectedHash = hash;

  // Update selection in list
  document.querySelectorAll('.commit-row').forEach((r) => {
    r.classList.toggle('selected', r.dataset.hash === hash);
  });

  // Show detail panel
  $detail.hidden = false;

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

  // Parse stat lines for files
  const files = parseStatLines(detail.stats);
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

function parseStatLines(stats) {
  const files = [];
  for (const line of stats) {
    // e.g. " src/foo.js | 10 ++++----"
    const match = line.match(
      /^\s*(.+?)\s*\|\s*(\d+)\s*([+-]*)\s*$/
    );
    if (match) {
      const pluses = (match[3].match(/\+/g) || []).length;
      const minuses = (match[3].match(/-/g) || []).length;
      let status = 'M';
      if (pluses > 0 && minuses === 0) status = 'A';
      if (minuses > 0 && pluses === 0) status = 'D';
      files.push({
        path: match[1].trim(),
        additions: pluses ? match[2] : '',
        deletions: minuses ? match[2] : '',
        status,
      });
    } else {
      // Check for rename or binary
      const binMatch = line.match(
        /^\s*(.+?)\s*\|\s*Bin/
      );
      if (binMatch) {
        files.push({
          path: binMatch[1].trim(),
          additions: '',
          deletions: '',
          status: 'M',
        });
      }
    }
  }
  return files;
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
  selectedHash = null;
  document.querySelectorAll('.commit-row').forEach(
    (r) => r.classList.remove('selected')
  );
};

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

// ── Auto-open repo from CLI args ────────────────
// If there's a path in the window title or env
(async () => {
  // Check if a path was passed via command line
  const urlParams = new URLSearchParams(
    window.location.search
  );
  const initPath = urlParams.get('repo');
  if (initPath) {
    await openRepo(initPath);
  }
})();
