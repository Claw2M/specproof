import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isSymlinkEscapingRoot,
  resolveContainedPath,
  type MutantResult,
  type MutationSummary,
} from '@specproof/core';
import { applyMutantToSource, type CandidateMutant } from './mutantGenerator.js';

export interface RunMutationOptions {
  repoRoot: string;
  mutants: CandidateMutant[];
  testCommand: string;
  timeoutMs: number;
  ignorePatterns?: string[];
  concurrency?: number;
}

interface CommandOutcome {
  exitCode: number | null;
  timedOut: boolean;
  spawnError: boolean;
  durationMs: number;
}

const FORBIDDEN_SHELL_TOKENS_RE = /[;&|`$<>()\r\n]/;

/**
 * Splits a test command into `[executable, args]` while rejecting shell chaining/redirection metacharacters.
 */
export function parseSafeCommand(command: string): { bin: string; args: string[] } {
  const trimmed = command.trim();
  if (!trimmed || FORBIDDEN_SHELL_TOKENS_RE.test(trimmed)) {
    throw new Error(
      `Unsafe or empty testCommand "${command}". Shell metacharacters (;, &, |, \`, $, <, >) are forbidden.`,
    );
  }

  const tokens: string[] = [];
  let current = '';
  let quote: '"' | '\'' | null = null;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i]!;
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === '\'') {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (quote) {
    throw new Error(`Unterminated quote in testCommand: ${command}`);
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  if (tokens.length === 0) {
    throw new Error('Empty testCommand.');
  }

  return { bin: tokens[0]!, args: tokens.slice(1) };
}

/**
 * Executes diff-scoped mutants inside an isolated temporary sandbox copy so the
 * user's working tree is never modified or left dirty if interrupted.
 */
export function runDiffMutations(options: RunMutationOptions): MutationSummary {
  const startedAt = Date.now();
  if (options.mutants.length === 0) {
    return {
      totalMutants: 0,
      killed: 0,
      survived: 0,
      timeouts: 0,
      errors: 0,
      score: 100,
      durationMs: 0,
      results: [],
    };
  }

  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 15_000;
  const parsedCommand = parseSafeCommand(options.testCommand);

  const sandboxRoot = createIsolatedSandbox(
    options.repoRoot,
    options.ignorePatterns ?? ['node_modules', 'dist', 'coverage', '.git', '.specproof-tmp'],
  );

  try {
    const baseline = executeTestCommand(sandboxRoot, parsedCommand, timeoutMs * 2);
    if (baseline.spawnError || baseline.timedOut || baseline.exitCode !== 0) {
      throw new Error(
        `Baseline test command failed (exitCode=${baseline.exitCode}, timedOut=${baseline.timedOut}, spawnError=${baseline.spawnError}). Fix failing tests before running mutation verification.`,
      );
    }

    const originalCache = new Map<string, string>();
    const results: MutantResult[] = [];

    for (const mutant of options.mutants) {
      const targetPath = resolveContainedPath(sandboxRoot, mutant.file);
      let original = originalCache.get(mutant.file);
      if (original === undefined) {
        original = fs.readFileSync(targetPath, 'utf8');
        originalCache.set(mutant.file, original);
      }

      const mutatedContent = applyMutantToSource(original, mutant);
      fs.writeFileSync(targetPath, mutatedContent, 'utf8');

      let outcome: CommandOutcome;
      try {
        outcome = executeTestCommand(sandboxRoot, parsedCommand, timeoutMs);
      } finally {
        fs.writeFileSync(targetPath, original, 'utf8');
      }

      const status = outcome.timedOut
        ? 'timeout'
        : outcome.spawnError
          ? 'error'
          : outcome.exitCode === 0
            ? 'survived'
            : 'killed';

      results.push({
        id: mutant.id,
        file: mutant.file,
        line: mutant.line,
        column: mutant.column,
        operator: mutant.operator,
        original: mutant.original,
        mutated: mutant.mutated,
        status,
        durationMs: outcome.durationMs,
      });
    }

    const killed = results.filter((r) => r.status === 'killed').length;
    const survived = results.filter((r) => r.status === 'survived').length;
    const timeouts = results.filter((r) => r.status === 'timeout').length;
    const errors = results.filter((r) => r.status === 'error').length;
    const denominator = killed + survived;
    const score = denominator === 0 ? 100 : (killed / denominator) * 100;

    return {
      totalMutants: results.length,
      killed,
      survived,
      timeouts,
      errors,
      score,
      durationMs: Date.now() - startedAt,
      results,
    };
  } finally {
    safeCleanupDir(sandboxRoot);
  }
}

function findNearestNodeModules(startDir: string): string | null {
  let current = fs.realpathSync(startDir);
  while (true) {
    const candidate = path.join(current, 'node_modules');
    if (fs.existsSync(candidate)) {
      return fs.realpathSync(candidate);
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function createIsolatedSandbox(repoRoot: string, ignorePatterns: string[]): string {
  const realRoot = fs.realpathSync(repoRoot);
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-sandbox-'));
  const ignoreSet = new Set([...ignorePatterns, 'node_modules', '.git', '.specproof-tmp']);

  fs.cpSync(realRoot, sandboxRoot, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(realRoot, src);
      if (!rel) {
        return true;
      }
      if (isSymlinkEscapingRoot(realRoot, src)) {
        return false;
      }
      const segments = rel.split(/[\\/]/);
      return !segments.some((seg) => ignoreSet.has(seg));
    },
  });

  const sourceNodeModules = findNearestNodeModules(realRoot);
  const targetNodeModules = path.join(sandboxRoot, 'node_modules');
  if (sourceNodeModules && !fs.existsSync(targetNodeModules)) {
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(sourceNodeModules, targetNodeModules, linkType);
  }

  return sandboxRoot;
}

function safeCleanupDir(dirPath: string): void {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'ENOTEMPTY') {
        throw err;
      }
    }
  }
}

function resolveSpawnArgs(parsed: { bin: string; args: string[] }): { bin: string; args: string[] } {
  const isWindowsBatch =
    process.platform === 'win32' &&
    (/\.(cmd|bat)$/i.test(parsed.bin) ||
      parsed.bin === 'npm' ||
      parsed.bin === 'npx' ||
      parsed.bin === 'pnpm' ||
      parsed.bin === 'yarn' ||
      parsed.bin === 'bun');

  const bin = isWindowsBatch ? (process.env.ComSpec ?? 'cmd.exe') : parsed.bin;
  const args = isWindowsBatch
    ? ['/d', '/s', '/c', parsed.bin === 'npm' ? 'npm.cmd' : parsed.bin, ...parsed.args]
    : parsed.args;
  return { bin, args };
}

function executeTestCommand(
  cwd: string,
  parsed: { bin: string; args: string[] },
  timeoutMs: number,
): CommandOutcome {
  const start = Date.now();
  const { bin, args } = resolveSpawnArgs(parsed);

  const res = spawnSync(bin, args, {
    cwd,
    shell: false,
    timeout: timeoutMs,
    stdio: 'ignore',
    windowsHide: true,
  });

  const errCode = (res.error as NodeJS.ErrnoException | undefined)?.code;
  const timedOut = errCode === 'ETIMEDOUT';
  const spawnError = Boolean(res.error && !timedOut) || (res.signal !== null && !timedOut);

  return {
    exitCode: res.status,
    timedOut,
    spawnError,
    durationMs: Date.now() - start,
  };
}

function executeTestCommandAsync(
  cwd: string,
  parsed: { bin: string; args: string[] },
  timeoutMs: number,
): Promise<CommandOutcome> {
  return new Promise((resolve) => {
    const start = Date.now();
    const { bin, args } = resolveSpawnArgs(parsed);
    const child = spawn(bin, args, {
      cwd,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });

    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: null,
        timedOut: false,
        spawnError: true,
        durationMs: Date.now() - start,
      });
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: code,
        timedOut,
        spawnError: !timedOut && signal !== null,
        durationMs: Date.now() - start,
      });
    });
  });
}

/**
 * Executes diff-scoped mutants asynchronously across a bounded pool of isolated
 * temporary sandboxes, keeping the Node event loop non-blocking.
 */
export async function runDiffMutationsAsync(options: RunMutationOptions): Promise<MutationSummary> {
  const startedAt = Date.now();
  if (options.mutants.length === 0) {
    return {
      totalMutants: 0,
      killed: 0,
      survived: 0,
      timeouts: 0,
      errors: 0,
      score: 100,
      durationMs: 0,
      results: [],
    };
  }

  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 15_000;
  const parsedCommand = parseSafeCommand(options.testCommand);
  const ignorePatterns = options.ignorePatterns ?? [
    'node_modules',
    'dist',
    'coverage',
    '.git',
    '.specproof-tmp',
  ];

  const defaultConcurrency = Math.min(4, Math.max(1, os.cpus().length - 1), options.mutants.length);
  const workerCount = Math.max(
    1,
    Math.min(options.mutants.length, options.concurrency ?? defaultConcurrency),
  );

  // Run baseline check in the first worker sandbox before spinning up remaining sandboxes
  const firstSandbox = createIsolatedSandbox(options.repoRoot, ignorePatterns);
  const sandboxes: string[] = [firstSandbox];

  try {
    const baseline = await executeTestCommandAsync(firstSandbox, parsedCommand, timeoutMs * 2);
    if (baseline.spawnError || baseline.timedOut || baseline.exitCode !== 0) {
      throw new Error(
        `Baseline test command failed (exitCode=${baseline.exitCode}, timedOut=${baseline.timedOut}, spawnError=${baseline.spawnError}). Fix failing tests before running mutation verification.`,
      );
    }

    for (let w = 1; w < workerCount; w += 1) {
      sandboxes.push(createIsolatedSandbox(options.repoRoot, ignorePatterns));
    }

    const orderedResults: Array<MutantResult | undefined> = new Array(options.mutants.length);
    let cursor = 0;

    async function runWorker(sandboxRoot: string): Promise<void> {
      const originalCache = new Map<string, string>();
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= options.mutants.length) {
          return;
        }

        const mutant = options.mutants[index]!;
        const targetPath = resolveContainedPath(sandboxRoot, mutant.file);
        let original = originalCache.get(mutant.file);
        if (original === undefined) {
          original = fs.readFileSync(targetPath, 'utf8');
          originalCache.set(mutant.file, original);
        }

        const mutatedContent = applyMutantToSource(original, mutant);
        fs.writeFileSync(targetPath, mutatedContent, 'utf8');

        let outcome: CommandOutcome;
        try {
          outcome = await executeTestCommandAsync(sandboxRoot, parsedCommand, timeoutMs);
        } finally {
          fs.writeFileSync(targetPath, original, 'utf8');
        }

        const status = outcome.timedOut
          ? 'timeout'
          : outcome.spawnError
            ? 'error'
            : outcome.exitCode === 0
              ? 'survived'
              : 'killed';

        orderedResults[index] = {
          id: mutant.id,
          file: mutant.file,
          line: mutant.line,
          column: mutant.column,
          operator: mutant.operator,
          original: mutant.original,
          mutated: mutant.mutated,
          status,
          durationMs: outcome.durationMs,
        };
      }
    }

    await Promise.all(sandboxes.map((sb) => runWorker(sb)));

    const results = orderedResults.filter((r): r is MutantResult => r !== undefined);
    const killed = results.filter((r) => r.status === 'killed').length;
    const survived = results.filter((r) => r.status === 'survived').length;
    const timeouts = results.filter((r) => r.status === 'timeout').length;
    const errors = results.filter((r) => r.status === 'error').length;
    const denominator = killed + survived;
    const score = denominator === 0 ? 100 : (killed / denominator) * 100;

    return {
      totalMutants: results.length,
      killed,
      survived,
      timeouts,
      errors,
      score,
      durationMs: Date.now() - startedAt,
      results,
    };
  } finally {
    for (const sb of sandboxes) {
      safeCleanupDir(sb);
    }
  }
}
