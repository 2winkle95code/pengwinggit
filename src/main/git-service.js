const simpleGit = require('simple-git');
const path = require('path');

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
      const raw = await this.git.raw([
        'show',
        '--stat',
        '--format=%H%n%P%n%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%D%n%B',
        hash,
      ]);
      const lines = raw.split('\n');
      // Body ends at the stat section (first empty line after body)
      const bodyLines = [];
      let i = 9; // skip first 9 format lines
      while (i < lines.length && lines[i] !== '') {
        bodyLines.push(lines[i]);
        i++;
      }
      // Stat lines follow
      const statLines = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim()) statLines.push(lines[j].trim());
      }

      return {
        hash: lines[0],
        parents: lines[1]
          ? lines[1].split(' ').filter(Boolean)
          : [],
        author: lines[2],
        authorEmail: lines[3],
        authorDate: lines[4],
        committer: lines[5],
        committerEmail: lines[6],
        committerDate: lines[7],
        refs: lines[8] || '',
        body: bodyLines.join('\n').trim(),
        stats: statLines,
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
      const status = await this.git.status();
      return {
        staged: status.staged,
        modified: status.modified,
        not_added: status.not_added,
        deleted: status.deleted,
        conflicted: status.conflicted,
        created: status.created,
        renamed: status.renamed,
        isClean: status.isClean(),
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
}

module.exports = GitService;
