const simpleGit = require('simple-git');
const path = require('path');
const { execSync } = require('child_process');

class GitService {
  constructor(repoPath) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  async isRepo() {
    try {
      return await this.git.checkIsRepo();
    } catch {
      return false;
    }
  }

  async getLog(opts = {}) {
    const maxCount = opts.maxCount || 500;
    try {
      // Use raw git log for graph-ready data with parent info
      const raw = await this.git.raw([
        'log',
        '--all',
        `--max-count=${maxCount}`,
        '--format=%H%n%P%n%an%n%ae%n%aI%n%D%n%s',
      ]);
      if (!raw.trim()) return [];

      const lines = raw.trim().split('\n');
      const commits = [];
      for (let i = 0; i + 6 < lines.length; i += 7) {
        commits.push({
          hash: lines[i],
          parents: lines[i + 1]
            ? lines[i + 1].split(' ').filter(Boolean)
            : [],
          author: lines[i + 2],
          email: lines[i + 3],
          date: lines[i + 4],
          refs: lines[i + 5] || '',
          message: lines[i + 6],
        });
      }
      return commits;
    } catch {
      return [];
    }
  }

  async getBranches() {
    try {
      const summary = await this.git.branch(['-a', '--no-color']);
      const local = [];
      const remote = [];
      for (const [name, info] of Object.entries(summary.branches)) {
        const entry = {
          name,
          current: info.current,
          commit: info.commit,
          label: info.label,
        };
        if (name.startsWith('remotes/')) {
          remote.push(entry);
        } else {
          local.push(entry);
        }
      }
      return {
        current: summary.current,
        local,
        remote,
      };
    } catch {
      return { current: '', local: [], remote: [] };
    }
  }

  async getTags() {
    try {
      const result = await this.git.tags();
      return result.all || [];
    } catch {
      return [];
    }
  }

  async getStashes() {
    try {
      const raw = await this.git.raw(['stash', 'list']);
      if (!raw.trim()) return [];
      return raw
        .trim()
        .split('\n')
        .map((line) => {
          const match = line.match(
            /^(stash@\{\d+\}):\s*(.+)$/
          );
          return match
            ? { ref: match[1], message: match[2] }
            : { ref: '', message: line };
        });
    } catch {
      return [];
    }
  }

  async getCommitDetail(hash) {
    try {
      const SEP = '---OCTOGIT-SEP---';
      const fmt = [
        '%H', '%P', '%an', '%ae', '%aI',
        '%cn', '%ce', '%cI', '%D', '%B',
      ].join(`${SEP}`);
      const [meta, numstat] = await Promise.all([
        this.git.raw([
          'show', '-s', `--format=${fmt}`, hash,
        ]),
        this.git.raw([
          'diff-tree', '-r', '--numstat', hash,
        ]),
      ]);

      const parts = meta.split(SEP);
      // Parse numstat: "added\tremoved\tpath"
      const files = numstat.trim().split('\n')
        .filter((l) => l && l.includes('\t'))
        .map((l) => {
          const [add, del, ...fp] = l.split('\t');
          const path = fp.join('\t');
          let status = 'M';
          if (add !== '-' && del === '0') status = 'A';
          if (add === '0' && del !== '0') status = 'D';
          return {
            path,
            additions: add === '-' ? 0 : parseInt(add),
            deletions: del === '-' ? 0 : parseInt(del),
            status,
          };
        });

      return {
        hash: parts[0]?.trim() || hash,
        parents: (parts[1] || '').trim()
          .split(' ').filter(Boolean),
        author: (parts[2] || '').trim(),
        authorEmail: (parts[3] || '').trim(),
        authorDate: (parts[4] || '').trim(),
        committer: (parts[5] || '').trim(),
        committerEmail: (parts[6] || '').trim(),
        committerDate: (parts[7] || '').trim(),
        refs: (parts[8] || '').trim(),
        body: (parts[9] || '').trim(),
        files,
      };
    } catch {
      return null;
    }
  }

  async getDiff(hash) {
    try {
      const raw = await this.git.raw([
        'diff-tree',
        '-p',
        '--stat',
        '-r',
        hash,
      ]);
      return raw;
    } catch {
      return '';
    }
  }

  async getFileDiff(hash, filePath) {
    try {
      const raw = await this.git.raw([
        'diff-tree',
        '-p',
        '-r',
        hash,
        '--',
        filePath,
      ]);
      return raw;
    } catch {
      return '';
    }
  }

  async getStatus() {
    try {
      // Use porcelain format for precise status information
      // Format: XY PATH where X=index, Y=worktree
      // NOTE: Using execSync instead of simple-git to avoid leading whitespace trimming
      const raw = execSync('git status --porcelain', {
        cwd: this.repoPath,
        encoding: 'utf8'
      });

      if (!raw.trim()) {
        return { files: [], isClean: true };
      }

      // Split first, then filter out empty lines (don't trim before split!)
      const files = raw.split('\n').filter(line => line.length > 0).map(line => {
        const index = line[0];     // Staging area status
        const worktree = line[1];  // Working tree status
        const path = line.substring(3);

        let status = '?';
        let staged = false;

        // Determine status based on git status codes
        if (index === 'A') {
          status = 'A'; // Added to index
          staged = true;
        } else if (index === 'M') {
          status = 'M'; // Modified in index
          staged = true;
        } else if (index === 'D') {
          status = 'D'; // Deleted in index
          staged = true;
        } else if (index === 'R') {
          status = 'R'; // Renamed in index
          staged = true;
        } else if (worktree === 'M') {
          status = 'M'; // Modified in worktree
        } else if (worktree === 'D') {
          status = 'D'; // Deleted in worktree
        } else if (index === '?' && worktree === '?') {
          status = 'U'; // Untracked
        }

        return { path, status, staged };
      });

      return {
        files,
        isClean: files.length === 0,
      };
    } catch {
      return null;
    }
  }

  async getRemotes() {
    try {
      const remotes = await this.git.getRemotes(true);
      return remotes;
    } catch {
      return [];
    }
  }

  async checkoutBranch(branch) {
    try {
      await this.git.checkout(branch);
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  }

  async getFileTree(hash) {
    try {
      const raw = await this.git.raw([
        'ls-tree',
        '-r',
        '--name-only',
        hash || 'HEAD',
      ]);
      return raw.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  async getFileContent(hash, filePath) {
    try {
      const raw = await this.git.raw([
        'show',
        `${hash || 'HEAD'}:${filePath}`,
      ]);
      return raw;
    } catch {
      return '';
    }
  }

  async getWorkdirDiff(filePath) {
    try {
      // Get diff for working directory file (staged or unstaged)
      const raw = await this.git.raw([
        'diff',
        'HEAD',
        '--',
        filePath,
      ]);
      return raw;
    } catch {
      return '';
    }
  }
}

module.exports = GitService;
