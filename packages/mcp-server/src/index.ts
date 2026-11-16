import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { formatMarkdownReport } from '@specproof/core';
import { verifyRepositoryAsync } from '@specproof/mutator';
import { z } from 'zod';

/**
 * Creates a configured SpecProof MCP server exposing deterministic test-integrity,
 * diff-scoped mutation, and spec-coverage verification tools.
 */
export function createSpecProofMcpServer(): McpServer {
  const server = new McpServer({
    name: 'specproof',
    version: '0.1.0',
  });

  server.registerTool(
    'check_test_integrity',
    {
      description:
        'Scan changed files (or all repository files) for AI test anti-patterns: vacuous assertions, empty tests, skipped tests, mock abuse, and swallowed errors.',
      inputSchema: {
        repoRoot: z.string().describe('Absolute path to the repository root.'),
        baseRef: z.string().optional().describe('Optional git base ref (e.g. main) for diff scoping.'),
        allFiles: z.boolean().optional().describe('Scan all files instead of only the git diff.'),
      },
    },
    async ({ repoRoot, baseRef, allFiles }) => {
      const report = await verifyRepositoryAsync({
        repoRoot,
        baseRef,
        allFiles,
        mutate: false,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                passed: report.passed,
                failureReasons: report.failureReasons,
                integrity: report.integrity,
                summaryMarkdown: formatMarkdownReport(report),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    'run_diff_mutation',
    {
      description:
        'Run fast diff-scoped micro-mutation testing in an isolated sandbox to prove tests actually catch broken logic on changed lines.',
      inputSchema: {
        repoRoot: z.string().describe('Absolute path to the repository root.'),
        baseRef: z.string().optional().describe('Optional git base ref (e.g. main).'),
        testCommand: z.string().optional().describe('Override test command (defaults to .specproof.json or npm test).'),
        failUnderScore: z.number().min(0).max(100).optional().describe('Minimum diff mutation score (0-100).'),
        allFiles: z.boolean().optional().describe('Mutate all supported source files up to maxMutantsPerRun.'),
      },
    },
    async ({ repoRoot, baseRef, testCommand, failUnderScore, allFiles }) => {
      const report = await verifyRepositoryAsync({
        repoRoot,
        baseRef,
        testCommand,
        failUnderMutationScore: failUnderScore,
        allFiles,
        mutate: true,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                passed: report.passed,
                failureReasons: report.failureReasons,
                mutation: report.mutation,
                summaryMarkdown: formatMarkdownReport(report),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    'verify_spec_coverage',
    {
      description:
        'Verify whether the current git diff and test changes cover acceptance criteria from SPEC.md or inline markdown requirements, optionally using BYOK LLM evaluation.',
      inputSchema: {
        repoRoot: z.string().describe('Absolute path to the repository root.'),
        specPath: z.string().optional().describe('Relative path to a markdown spec file (e.g. SPEC.md).'),
        specMarkdown: z.string().optional().describe('Inline markdown checklist of requirements.'),
        baseRef: z.string().optional().describe('Optional git base ref.'),
        useLlm: z.boolean().optional().describe('Use BYOK LLM (OpenAI/Anthropic/Gemini env key) for semantic verification.'),
        provider: z.enum(['openai', 'anthropic', 'gemini']).optional().describe('Optional explicit BYOK LLM provider.'),
      },
    },
    async ({ repoRoot, specPath, specMarkdown, baseRef, useLlm, provider }) => {
      const report = await verifyRepositoryAsync({
        repoRoot,
        specPath,
        specMarkdown,
        baseRef,
        useLlm,
        llmProvider: provider,
        mutate: false,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                passed: report.passed,
                specCoverage: report.specCoverage,
                summaryMarkdown: formatMarkdownReport(report),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createSpecProofMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
