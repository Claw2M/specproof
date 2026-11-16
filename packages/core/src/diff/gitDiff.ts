import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { resolveContainedPath } from '../security/pathSafety.js';
import type { FileDiff, LineRange } from '../types.js';

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Parses a unified git diff string into structured file diffs with added line ranges.
 */
export function parseUnifiedDiff(diffText: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;
  let newLineCursor = 0;

  for (const rawLine of diffText.split(/\r?\n/)) {
    if (rawLine.startsWith('diff --git ')) {
      if (current) {
        files.push(current);
      }
      const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(rawLine);
      const filePath = match?.[2] ? normalizePath(match[2]) : '';
      current = {
        path: filePath,
        status: 'modified',
        addedRanges: [],
        addedLines: [],
      };
      newLineCursor = 0;
      continue;
    }

    if (!current) {
      continue;
    }

    if (rawLine.startsWith('new file mode ')) {
      current.status = 'added';
      continue;
    }

    if (rawLine.startsWith('deleted file mode ')) {
      current.status = 'deleted';
      continue;
    }

    if (rawLine.startsWith('rename to ')) {
      current.status = 'renamed';
      current.path = normalizePath(rawLine.slice('rename to '.length).trim());
      continue;
    }

    if (rawLine.startsWith('+++ b/')) {
      current.path = normalizePath(rawLine.slice('+++ b/'.length).trim());
      continue;
    }

    if (rawLine.startsWith('+++ /dev/null')) {
      current.status = 'deleted';
      continue;
    }

    if (rawLine.startsWith('Binary files ') || rawLine.startsWith('GIT binary patch')) {
      current.status = 'deleted';
      newLineCursor = 0;
      continue;
    }

    const hunkMatch = HUNK_HEADER_RE.exec(rawLine);
    if (hunkMatch) {
      newLineCursor = Number(hunkMatch[1]);
      continue;
    }

    if (rawLine.startsWith('--- ')) {
      continue;
    }

    if (rawLine.startsWith('+') && newLineCursor > 0) {
      current.addedLines.push(rawLine.slice(1));
      appendLineToRanges(current.addedRanges, newLineCursor);
      newLineCursor += 1;
      continue;
    }

    if (rawLine.startsWith(' ') && newLineCursor > 0) {
      newLineCursor += 1;
    }
  }

  if (current) {
    files.push(current);
  }

  return files.filter((f) => f.path.length > 0 && f.status !== 'deleted');
}

function appendLineToRanges(ranges: LineRange[], line: number): void {
  const last = ranges[ranges.length - 1];
  if (last && last.end + 1 === line) {
    last.end = line;
    return;
  }
  ranges.push({ start: line, end: line });
}

export interface GitDiffOptions {
  baseRef?: string;
  includeUntracked?: boolean;
}

function validateGitRef(ref: string): string {
  const trimmed = ref.trim();
  if (
    !trimmed ||
    trimmed.startsWith('-') ||
    /[\s\0\r\n]/.test(trimmed) ||
    trimmed.includes('..')
  ) {
    throw new Error(`Invalid git base reference: ${ref}`);
  }
  return trimmed;
}

/**
 * Collects changed files and line ranges from a Git repository using safe argument arrays.
 */
export function getGitDiff(repoRoot: string, options: GitDiffOptions = {}): FileDiff[] {
  if (options.baseRef !== undefined) {
    const safeRef = validateGitRef(options.baseRef);
    try {
      execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${safeRef}^{commit}`], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      throw new Error(`Git base reference not found: ${safeRef}`);
    }

    const diffText = execFileSync(
      'git',
      ['-c', 'core.quotePath=false', '-c', 'diff.noprefix=false', 'diff', '--unified=0', '--no-color', `${safeRef}...HEAD`],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return parseUnifiedDiff(diffText);
  }

  let diffText = '';
  try {
    diffText = execFileSync(
      'git',
      ['-c', 'core.quotePath=false', '-c', 'diff.noprefix=false', 'diff', '--unified=0', '--no-color', 'HEAD'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch {
    try {
      diffText = execFileSync(
        'git',
        ['-c', 'core.quotePath=false', '-c', 'diff.noprefix=false', 'diff', '--unified=0', '--no-color', '--cached'],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch {
      return [];
    }
  }

  const parsed = parseUnifiedDiff(diffText);

  if (options.includeUntracked !== false) {
    const untracked = getUntrackedFileDiffs(repoRoot);
    const seen = new Set(parsed.map((f) => f.path));
    for (const file of untracked) {
      if (!seen.has(file.path)) {
        parsed.push(file);
      }
    }
  }

  return parsed;
}

const BINARY_EXT_RE =
  /\.(?:sqlite|sqlite3|db|png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|tar|wasm|exe|dll|so|dylib|pyc|pyo|woff2?)$/i;

function isLikelyBinaryBuffer(buf: Buffer): boolean {
  const sampleLen = Math.min(buf.length, 4096);
  for (let i = 0; i < sampleLen; i += 1) {
    if (buf[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Attempts to infer an `owner/repo` slug from `git remote get-url origin`.
 */
export function inferRepoSlugFromGit(repoRoot: string): string | undefined {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const match = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function getUntrackedFileDiffs(repoRoot: string): FileDiff[] {
  try {
    const output = execFileSync(
      'git',
      ['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard', '-z'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const diffs: FileDiff[] = [];
    for (const rawPath of output.split('\0').map((s) => s.trim()).filter(Boolean)) {
      const relPath = normalizePath(rawPath);
      if (BINARY_EXT_RE.test(relPath)) {
        continue;
      }
      let fullPath: string;
      try {
        fullPath = resolveContainedPath(repoRoot, relPath);
      } catch {
        continue;
      }
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        continue;
      }
      const buf = fs.readFileSync(fullPath);
      if (isLikelyBinaryBuffer(buf)) {
        continue;
      }
      const lines = buf.toString('utf8').split(/\r?\n/);
      diffs.push({
        path: relPath,
        status: 'added',
        addedRanges: [{ start: 1, end: Math.max(1, lines.length) }],
        addedLines: lines,
      });
    }
    return diffs;
  } catch {
    return [];
  }
}

export function isLineInRanges(line: number, ranges: LineRange[]): boolean {
  return ranges.some((range) => line >= range.start && line <= range.end);
}
