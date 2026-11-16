import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  analyzeFilesIntegrity,
  collectProjectFiles,
  evaluateSpecCoverage,
  getGitDiff,
  loadConfig,
  parseRequirementsFromMarkdown,
  parseUnifiedDiff,
  resolveContainedPath,
} from '../src/index.js';

describe('parseUnifiedDiff & getGitDiff', () => {
  it('extracts modified files, ignores deleted/binary files, and handles renames and context lines', () => {
    const patch = [
      'diff --git a/src/auth.ts b/src/auth.ts',
      'index 1111111..2222222 100644',
      '--- a/src/auth.ts',
      '+++ b/src/auth.ts',
      '@@ -10,0 +11,2 @@',
      '+if (user.role === "admin") {',
      '+  return true;',
      '@@ -25,1 +27,1 @@',
      ' const keep = 1;',
      '+return false;',
      'diff --git a/src/old.ts b/src/old.ts',
      'deleted file mode 100644',
      '--- a/src/old.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-export const old = 1;',
      'diff --git a/assets/logo.png b/assets/logo.png',
      'Binary files a/assets/logo.png and b/assets/logo.png differ',
      'diff --git a/src/a.ts b/src/b.ts',
      'similarity index 95%',
      'rename from src/a.ts',
      'rename to src/b.ts',
    ].join('\n');

    const files = parseUnifiedDiff(patch);
    expect(files.map((f) => f.path)).toEqual(['src/auth.ts', 'src/b.ts']);
    expect(files[0]?.addedRanges).toEqual([
      { start: 11, end: 12 },
      { start: 28, end: 28 },
    ]);
    expect(files[1]?.status).toBe('renamed');
  });

  it('rejects option-injection git refs and reads real git repo staged/untracked changes', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-git-'));
    try {
      execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(tmpDir, 'staged.ts'), 'export const s = 1;\n');
      execFileSync('git', ['add', 'staged.ts'], { cwd: tmpDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(tmpDir, 'untracked.ts'), 'export const u = 2;\n');
      fs.writeFileSync(path.join(tmpDir, 'binary.sqlite'), Buffer.from([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x00, 0x01]));

      const diff = getGitDiff(tmpDir);
      expect(diff.map((d) => d.path).sort()).toEqual(['staged.ts', 'untracked.ts']);

      expect(() => getGitDiff(tmpDir, { baseRef: '--output=/tmp/evil' })).toThrow(
        /Invalid git base reference/,
      );
      expect(() => getGitDiff(tmpDir, { baseRef: 'nonexistent-branch-xyz' })).toThrow(
        /Git base reference not found/,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('resolveContainedPath & collectProjectFiles', () => {
  it('blocks traversal, absolute paths, and collects non-ignored source files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-path-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'src/app.ts'), 'export const x = 1;\n');
      fs.writeFileSync(path.join(tmpDir, 'dist/app.js'), 'export const x = 1;\n');

      expect(() => resolveContainedPath(tmpDir, '../secret.env')).toThrow(/escapes/);
      expect(() => resolveContainedPath(tmpDir, path.join(tmpDir, 'src/app.ts'))).toThrow(
        /must be relative/,
      );

      const collected = collectProjectFiles(tmpDir, DEFAULT_CONFIG.ignorePatterns);
      expect(collected).toEqual(['src/app.ts']);

      fs.writeFileSync(path.join(tmpDir, '.specproof.json'), JSON.stringify({ maxMutantsPerRun: 9 }));
      const cfg = loadConfig(tmpDir);
      expect(cfg.maxMutantsPerRun).toBe(9);
      expect(cfg.testCommand).toBe('npm test');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('analyzeFilesIntegrity', () => {
  it('detects vacuous assertions, empty tests, skipped tests, mock abuse, and swallowed errors', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-core-test-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src/service.ts'),
        `export function loadData() {
  try {
    return 42;
  } catch (err) {
    console.log(err);
  }
}
export function fetchAsync(p: Promise<unknown>) {
  return p.catch(() => {});
}
`,
      );

      fs.writeFileSync(
        path.join(tmpDir, 'src/service.test.ts'),
        `import { describe, expect, it, vi } from 'vitest';

vi.mock('./db');
vi.mock('./cache');
vi.mock('./logger');

describe('fake suite', () => {
  it('vacuous test', () => {
    expect(true).toBe(true);
    expect.soft(-1).toBe(-1);
  });

  it('empty test', () => {
    const x = 1 + 1;
  });

  it.skip('skipped test', () => {
    expect(1).toBe(2);
  });
});
`,
      );

      const summary = analyzeFilesIntegrity(
        tmpDir,
        ['src/service.ts', 'src/service.test.ts', 'src/missing.ts'],
        DEFAULT_CONFIG,
      );

      expect(summary.filesScanned).toBe(2);
      const ruleIds = summary.findings.map((f) => f.ruleId);
      expect(ruleIds.filter((r) => r === 'swallowed-error')).toHaveLength(2);
      expect(ruleIds.filter((r) => r === 'vacuous-assertion')).toHaveLength(2);
      expect(ruleIds).toContain('empty-test');
      expect(ruleIds).toContain('skipped-test');
      expect(ruleIds).toContain('mock-abuse');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips deletion-only diffs and reports zero findings for genuine tests', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-clean-test-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src/math.test.ts'),
        `import { expect, it } from 'vitest';
import { add } from './math.js';

it('adds positive numbers', () => {
  expect(add(2, 3)).toBe(5);
});
`,
      );

      const summary = analyzeFilesIntegrity(tmpDir, ['src/math.test.ts'], DEFAULT_CONFIG);
      expect(summary.findings).toHaveLength(0);
      expect(summary.totalTests).toBe(1);
      expect(summary.totalAssertions).toBe(1);

      const delOnly = analyzeFilesIntegrity(tmpDir, ['src/math.test.ts'], DEFAULT_CONFIG, {
        diffRangesByFile: new Map([['src/math.test.ts', []]]),
      });
      expect(delOnly.findings).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('specMapper', () => {
  it('maps acceptance criteria keywords and ignores fenced code blocks', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-spec-test-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src/billing.ts'),
        `export function calculateDiscount(amount: number) { return amount * 0.9; }\n`,
      );

      const spec = [
        '```md',
        '- [ ] Ignore requirement inside fenced code block',
        '```',
        '- [ ] Implement calculateDiscount for annual billing plans',
        '- [ ] Enforce webhook signature verification on billing callbacks',
      ].join('\n');

      const parsed = parseRequirementsFromMarkdown(spec);
      expect(parsed).toHaveLength(2);

      const coverage = evaluateSpecCoverage(
        tmpDir,
        spec,
        [
          {
            path: 'src/billing.ts',
            status: 'modified',
            addedRanges: [{ start: 1, end: 1 }],
            addedLines: ['export function calculateDiscount(amount: number) { return amount * 0.9; }'],
          },
        ],
        'SPEC.md',
      );

      expect(coverage.totalRequirements).toBe(2);
      expect(coverage.coveredCount).toBe(1);
      expect(coverage.requirements[0]?.covered).toBe(true);
      expect(coverage.requirements[1]?.covered).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
