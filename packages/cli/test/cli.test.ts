import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createCloudServer } from '../../../apps/web/src/server.js';
import { createSpecProofMcpServer } from '@specproof/mcp-server';

const execFileAsync = promisify(execFile);

describe('specproof mcp-server and cli', () => {
  const cliBin = path.resolve(import.meta.dirname, '../dist/index.js');

  it('constructs the MCP server cleanly', () => {
    const server = createSpecProofMcpServer();
    expect(server).toBeDefined();
  });

  it('runs specproof init, help, unknown command, and check --all --json', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-cli-e2e-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src/broken.test.ts'),
        `import { expect, it } from 'vitest';\nit('fake', () => { expect(true).toBe(true); });\n`,
      );

      // 1. init creates .specproof.json without overwriting on second run
      const init1 = execFileSync(process.execPath, [cliBin, 'init', '--repo', tmpDir], {
        encoding: 'utf8',
      });
      expect(init1).toContain('Created');
      expect(fs.existsSync(path.join(tmpDir, '.specproof.json'))).toBe(true);

      const init2 = execFileSync(process.execPath, [cliBin, 'init', '--repo', tmpDir], {
        encoding: 'utf8',
      });
      expect(init2).toContain('Found existing');

      // 2. check catches vacuous assertion
      let stdout = '';
      let exitCode = 0;
      try {
        stdout = execFileSync(process.execPath, [cliBin, 'check', '--repo', tmpDir, '--all', '--json'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        const execErr = err as { status?: number; stdout?: string };
        exitCode = execErr.status ?? 1;
        stdout = execErr.stdout ?? '';
      }

      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout) as { passed: boolean; integrity: { findings: Array<{ ruleId: string }> } };
      expect(parsed.passed).toBe(false);
      expect(parsed.integrity.findings.some((f) => f.ruleId === 'vacuous-assertion')).toBe(true);

      // 3. unknown command returns exit code 1
      let badCmdExit = 0;
      try {
        execFileSync(process.execPath, [cliBin, 'nonexistent-cmd'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        badCmdExit = (err as { status?: number }).status ?? 1;
      }
      expect(badCmdExit).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('syncs policy/specs and uploads report via specproof check --cloud', async () => {
    const { server, store } = createCloudServer({ dbPath: ':memory:', apiToken: 'cloud-tok' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-cli-cloud-'));
    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('Unexpected address');
      }
      const cloudUrl = `http://127.0.0.1:${addr.port}`;

      store.updatePolicy({ minMutationScore: 80, requireSpecMatch: true });
      store.upsertSpec({
        externalId: 'LIN-77',
        source: 'linear',
        repoSlug: 'acme/cli-repo',
        title: 'Boundary check',
        checklistMarkdown: '- [ ] Implement checkLimit boundary logic',
      });

      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src/limit.mjs'),
        'export function checkLimit(n) {\n  return n >= 5;\n}\n',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src/limit.test.mjs'),
        "import assert from 'node:assert/strict';\nimport { checkLimit } from './limit.mjs';\nassert.equal(checkLimit(5), true);\nassert.equal(checkLimit(4), false);\n",
      );

      const { stdout: output } = await execFileAsync(
        process.execPath,
        [
          cliBin,
          'check',
          '--repo',
          tmpDir,
          '--all',
          '--mutate',
          '--test-cmd',
          'node src/limit.test.mjs',
          '--cloud',
          cloudUrl,
          '--repo-slug',
          'acme/cli-repo',
          '--markdown',
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            SPECPROOF_CLOUD_TOKEN: 'cloud-tok',
            GITHUB_HEAD_REF: '',
            GITHUB_REF_NAME: 'main',
          },
        },
      );

      expect(output).toContain('SpecProof Verification Gate: PASSED');
      expect(store.listRuns()).toHaveLength(1);
      expect(store.listRuns()[0]?.branch).toBe('main');
      expect(store.listRuns()[0]?.mutationScore).toBe(100);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      store.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
