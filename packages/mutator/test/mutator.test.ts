import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyMutantToSource,
  collectGoMutants,
  collectPythonMutants,
  generateDiffMutants,
  parseSafeCommand,
  runDiffMutations,
  runDiffMutationsAsync,
  verifyRepositoryAsync,
} from '../src/index.js';

describe('diff-scoped micro-mutation & verifyPipeline', () => {
  it('generates mutants only for changed lines in production files and skips template concatenation', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-mutgen-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src/guard.ts'),
        [
          'export function untouched(a: number) {',
          '  return a + 1;',
          '}',
          'export function isAdult(age: number) {',
          '  const label = `age:` + age;',
          '  return age >= 18;',
          '}',
        ].join('\n'),
      );

      const mutants = generateDiffMutants(
        tmpDir,
        [
          {
            path: 'src/guard.ts',
            status: 'modified',
            addedRanges: [
              { start: 5, end: 6 },
            ],
            addedLines: ['  const label = `age:` + age;', '  return age >= 18;'],
          },
        ],
        10,
      );

      expect(mutants).toHaveLength(1);
      expect(mutants[0]?.line).toBe(6);
      expect(mutants[0]?.original).toBe('>=');
      expect(mutants[0]?.mutated).toBe('>');

      // Deletion-only diff (empty addedRanges) yields 0 mutants
      const delOnly = generateDiffMutants(
        tmpDir,
        [{ path: 'src/guard.ts', status: 'modified', addedRanges: [], addedLines: [] }],
        10,
      );
      expect(delOnly).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('kills tested mutations, handles baseline failures, timeouts, and zero mutants', () => {
    const emptySummary = runDiffMutations({
      repoRoot: process.cwd(),
      mutants: [],
      testCommand: 'node -e "process.exit(1)"',
      timeoutMs: 1000,
    });
    expect(emptySummary.score).toBe(100);
    expect(emptySummary.totalMutants).toBe(0);

    expect(() => parseSafeCommand('npm test && rm -rf /')).toThrow(/Unsafe or empty testCommand/);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-mutrun-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src/check.mjs'),
        ['export function isAdult(age) {', '  return age >= 18;', '}'].join('\n'),
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src/check.test.mjs'),
        [
          "import assert from 'node:assert/strict';",
          "import { isAdult } from './check.mjs';",
          'assert.equal(isAdult(20), true);',
          'assert.equal(isAdult(10), false);',
        ].join('\n'),
      );

      const mutants = generateDiffMutants(
        tmpDir,
        [
          {
            path: 'src/check.mjs',
            status: 'modified',
            addedRanges: [{ start: 2, end: 2 }],
            addedLines: ['  return age >= 18;'],
          },
        ],
        10,
      );

      const summary = runDiffMutations({
        repoRoot: tmpDir,
        mutants,
        testCommand: 'node src/check.test.mjs',
        timeoutMs: 5000,
      });
      expect(summary.totalMutants).toBe(1);
      expect(summary.survived).toBe(1);
      expect(summary.score).toBe(0);

      // Baseline failure test
      fs.writeFileSync(
        path.join(tmpDir, 'src/fail.test.mjs'),
        'throw new Error("broken baseline");\n',
      );
      expect(() =>
        runDiffMutations({
          repoRoot: tmpDir,
          mutants,
          testCommand: 'node src/fail.test.mjs',
          timeoutMs: 5000,
        }),
      ).toThrow(/Baseline test command failed/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles timeout mutants cleanly without counting timeouts as killed/survived', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-timeout-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src/loop.mjs'),
        ['export function runOnce() {', '  let keep = false;', '  while (keep) {}', '  return 1;', '}'].join('\n'),
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src/loop.test.mjs'),
        ["import assert from 'node:assert/strict';", "import { runOnce } from './loop.mjs';", 'assert.equal(runOnce(), 1);'].join('\n'),
      );

      const mutants = generateDiffMutants(
        tmpDir,
        [{ path: 'src/loop.mjs', status: 'modified', addedRanges: [{ start: 2, end: 2 }], addedLines: ['  let keep = false;'] }],
        5,
      );
      expect(mutants).toHaveLength(1);

      const summary = runDiffMutations({
        repoRoot: tmpDir,
        mutants,
        testCommand: 'node src/loop.test.mjs',
        timeoutMs: 300,
      });
      expect(summary.timeouts).toBe(1);
      expect(summary.score).toBe(100);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('generates Python mutants cleanly on async/triple-quoted code without mutating return arrows', () => {
    const source = [
      'async def is_eligible(',
      '    score: int,',
      ') -> bool:',
      '    """Docstring with \\"\\"\\" and score >= 10"""',
      '    note = "escaped \\" != quote"  # comment == 1',
      '    return score >= 10 and True',
    ].join('\n');

    const mutants: ReturnType<typeof generateDiffMutants> = [];
    collectPythonMutants(source, 'app/rules.py', [{ start: 1, end: 6 }], mutants, 10);

    expect(mutants.every((m) => m.line === 6)).toBe(true);
    expect(mutants.map((m) => `${m.original} => ${m.mutated}`)).toEqual([
      '>= => >',
      'and => or',
      'True => False',
    ]);

    const firstMutated = applyMutantToSource(source, mutants[0]!);
    expect(firstMutated).toContain('return score > 10 and True');
  });

  it('recomputes passed and failureReasons in verifyRepositoryAsync after BYOK LLM + policy flags', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-async-pipe-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'src/a.ts'), 'export const ok = true;\n');
      fs.writeFileSync(path.join(tmpDir, 'SPEC.md'), '- [ ] Must enforce audit logging\n');

      const report = await verifyRepositoryAsync({
        repoRoot: tmpDir,
        allFiles: true,
        specPath: 'SPEC.md',
        useLlm: true,
        requireSpecMatch: true,
        byokOptions: {
          provider: 'openai',
          apiKey: 'fake-key',
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        items: [{ id: 'REQ-1', verdict: 'missing', reason: 'No audit log found' }],
                      }),
                    },
                  },
                ],
              }),
              { status: 200 },
            ),
        },
      });

      expect(report.specCoverage?.evaluatedBy).toBe('openai');
      expect(report.passed).toBe(false);
      expect(report.failureReasons.some((r) => r.includes('requireSpecMatch'))).toBe(true);

      // Missing SPEC.md when requireSpecMatch is true must fail
      fs.rmSync(path.join(tmpDir, 'SPEC.md'));
      const missingSpecReport = await verifyRepositoryAsync({
        repoRoot: tmpDir,
        allFiles: true,
        requireSpecMatch: true,
      });
      expect(missingSpecReport.passed).toBe(false);
      expect(missingSpecReport.failureReasons[0]).toContain('Spec coverage required by policy');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('collects Go mutants only on executable added lines while ignoring comments and strings', () => {
    const goSource = [
      'package rules',
      '// comment score >= 10 && true',
      'func IsEligible(score int) bool {',
      '\tlabel := "raw == text >= 1"',
      '\t_ = label',
      '\treturn score >= 10 && true',
      '}',
    ].join('\n');

    const mutants: ReturnType<typeof generateDiffMutants> = [];
    collectGoMutants(goSource, 'pkg/rules.go', [{ start: 1, end: 7 }], mutants, 10);

    expect(mutants.every((m) => m.line === 6)).toBe(true);
    expect(mutants.map((m) => `${m.original} => ${m.mutated}`)).toEqual([
      '>= => >',
      '&& => ||',
      'true => false',
    ]);
    const mutated = applyMutantToSource(goSource, mutants[0]!);
    expect(mutated).toContain('return score > 10 && true');
  });

  it('runs multiple mutants concurrently via runDiffMutationsAsync and preserves deterministic ordering', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-async-mut-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src/rules.mjs'),
        [
          'export function canEnter(age, verified) {',
          '  const flag = true;',
          '  return age >= 18 && verified && flag;',
          '}',
        ].join('\n'),
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src/rules.test.mjs'),
        [
          "import assert from 'node:assert/strict';",
          "import { canEnter } from './rules.mjs';",
          'assert.equal(canEnter(18, true), true);',
          'assert.equal(canEnter(17, true), false);',
          'assert.equal(canEnter(18, false), false);',
        ].join('\n'),
      );

      const mutants = generateDiffMutants(
        tmpDir,
        [
          {
            path: 'src/rules.mjs',
            status: 'modified',
            addedRanges: [{ start: 2, end: 3 }],
            addedLines: ['  const flag = true;', '  return age >= 18 && verified && flag;'],
          },
        ],
        10,
      );
      expect(mutants.length).toBeGreaterThanOrEqual(3);

      const summary = await runDiffMutationsAsync({
        repoRoot: tmpDir,
        mutants,
        testCommand: 'node src/rules.test.mjs',
        concurrency: 2,
        timeoutMs: 5000,
      });
      expect(summary.totalMutants).toBe(mutants.length);
      expect(summary.killed).toBe(mutants.length);
      expect(summary.survived).toBe(0);
      expect(summary.score).toBe(100);
      expect(summary.results.map((r) => r.id)).toEqual(mutants.map((m) => m.id));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
