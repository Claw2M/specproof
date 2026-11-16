import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

function parseToolTextJson<T>(result: unknown): T {
  const res = result as { content?: Array<{ type: string; text?: string }> };
  const text = res.content?.find((c) => c.type === 'text')?.text ?? '{}';
  return JSON.parse(text) as T;
}

describe('SpecProof MCP server JSON-RPC over stdio', () => {
  it('connects via stdio, lists all 3 tools, and executes integrity, mutation, and spec tools', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-mcp-e2e-'));
    const binPath = path.resolve(import.meta.dirname, '../dist/bin.js');

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [binPath],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'specproof-test-client', version: '0.1.0' });

    try {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src/guard.mjs'),
        'export function allow(x) {\n  return x >= 10;\n}\n',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src/guard.test.mjs'),
        [
          "import assert from 'node:assert/strict';",
          "import { allow } from './guard.mjs';",
          'assert.equal(allow(20), true);',
          'assert.equal(allow(5), false);',
        ].join('\n'),
      );
      fs.writeFileSync(
        path.join(tmpDir, 'SPEC.md'),
        '- [ ] Implement allow boundary check for values >= 10\n',
      );

      await client.connect(transport);

      const toolsList = await client.listTools();
      const toolNames = toolsList.tools.map((t) => t.name).sort();
      expect(toolNames).toEqual([
        'check_test_integrity',
        'run_diff_mutation',
        'verify_spec_coverage',
      ]);

      const integrityRes = await client.callTool({
        name: 'check_test_integrity',
        arguments: { repoRoot: tmpDir, allFiles: true },
      });
      const integrityJson = parseToolTextJson<{ passed: boolean }>(integrityRes);
      expect(integrityJson.passed).toBe(true);

      const mutationRes = await client.callTool({
        name: 'run_diff_mutation',
        arguments: {
          repoRoot: tmpDir,
          allFiles: true,
          testCommand: 'node src/guard.test.mjs',
          failUnderScore: 90,
        },
      });
      const mutationJson = parseToolTextJson<{
        passed: boolean;
        mutation: { totalMutants: number; survived: number; score: number };
      }>(mutationRes);
      expect(mutationJson.mutation.totalMutants).toBe(1);
      expect(mutationJson.mutation.survived).toBe(1);
      expect(mutationJson.passed).toBe(false);

      const specRes = await client.callTool({
        name: 'verify_spec_coverage',
        arguments: { repoRoot: tmpDir, specPath: 'SPEC.md', useLlm: false },
      });
      const specJson = parseToolTextJson<{
        specCoverage: { totalRequirements: number; coveredCount: number };
      }>(specRes);
      expect(specJson.specCoverage.totalRequirements).toBe(1);
      expect(specJson.specCoverage.coveredCount).toBe(1);
    } finally {
      await client.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
