#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  DEFAULT_CONFIG,
  fetchCloudPolicyAndSpecs,
  formatMarkdownReport,
  formatTerminalReport,
  inferRepoSlugFromGit,
  postOrUpdatePrComment,
  publishGitHubCheckRun,
  uploadVerificationReport,
  type LlmProvider,
} from '@specproof/core';
import { startMcpServer } from '@specproof/mcp-server';
import { verifyRepositoryAsync } from '@specproof/mutator';

const CLI_VERSION = '0.2.0';
const VALID_PROVIDERS = new Set<LlmProvider>(['openai', 'anthropic', 'gemini']);

function printHelp(): void {
  console.log(`SpecProof v${CLI_VERSION} — Diff-Scoped Test Integrity, Micro-Mutation & Spec Gate

Usage:
  specproof init                 Create .specproof.json and print MCP / CI setup
  specproof check [options]      Verify current git diff or repository
  specproof mcp                  Start the stdio MCP server for Cursor / Claude Code

Check Options:
  --repo <path>                  Repository root (default: current directory)
  --config <path>                Custom config file path (relative to --repo)
  --base <git-ref>               Compare against git base ref (e.g. origin/main)
  --all                          Scan all files rather than only the git diff
  --mutate                       Run diff-scoped micro-mutation testing
  --test-cmd <cmd>               Override test command (default from .specproof.json)
  --fail-under <0-100>           Minimum diff mutation score to pass
  --strict                       Fail on mock-abuse warnings as well as errors
  --require-spec-match           Fail if any spec acceptance criterion is uncovered
  --spec <path>                  Path to markdown spec file (e.g. SPEC.md)
  --llm                          Enable BYOK LLM semantic spec verification
  --provider <name>              LLM provider: openai | anthropic | gemini
  --model <name>                 Override LLM model name
  --post-pr-comment              Post/update sticky GitHub PR comment (uses GITHUB_TOKEN)
  --post-check-run               Publish GitHub Check Run with inline annotations
  --sha <commit-sha>             Commit SHA for Check Run (defaults to GITHUB_SHA)
  --cloud <url>                  Pull org policy + synced specs AND upload report to Team Cloud
  --upload <url>                 Upload report to SpecProof Team Cloud (uses SPECPROOF_CLOUD_TOKEN)
  --branch <name>                Branch name metadata for cloud upload
  --repo-slug <owner/repo>       GitHub repo slug (auto-inferred from git origin if omitted)
  --pr <number>                  Pull Request number (defaults to PR_NUMBER / GITHUB_REF)
  --json                         Output structured JSON
  --markdown                     Output GitHub PR markdown comment
  --version, -v                  Print CLI version
  --help, -h                     Show help
`);
}

function runInit(repoRoot: string): void {
  const configPath = path.join(repoRoot, '.specproof.json');
  if (!fs.existsSync(configPath)) {
    const pkgPath = path.join(repoRoot, 'package.json');
    const detected = { ...DEFAULT_CONFIG };
    if (fs.existsSync(path.join(repoRoot, 'pytest.ini')) || fs.existsSync(path.join(repoRoot, 'pyproject.toml'))) {
      detected.testCommand = 'pytest';
    } else if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
          scripts?: Record<string, string>;
        };
        if (pkg.scripts?.test && !pkg.scripts.test.includes('no test specified')) {
          detected.testCommand = 'npm test';
        }
      } catch (err) {
        if (!(err instanceof SyntaxError)) {
          throw err;
        }
      }
    }
    fs.writeFileSync(configPath, `${JSON.stringify(detected, null, 2)}\n`, 'utf8');
    console.log(`Created ${configPath}`);
  } else {
    console.log(`Found existing ${configPath}`);
  }

  console.log('\nAdd to Cursor / Claude Code MCP config:');
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          specproof: {
            command: 'npx',
            args: ['-y', '@specproof/cli', 'mcp'],
          },
        },
      },
      null,
      2,
    ),
  );
}

function resolvePrNumber(prFlag: string | undefined): number | undefined {
  const prRaw =
    prFlag ??
    process.env.PR_NUMBER ??
    /refs\/pull\/(\d+)\//.exec(process.env.GITHUB_REF ?? '')?.[1];
  if (prRaw === undefined) {
    return undefined;
  }
  const parsed = Number(prRaw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid PR number "${prRaw}". Expected a positive integer.`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: rawArgs,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      repo: { type: 'string' },
      config: { type: 'string' },
      base: { type: 'string' },
      all: { type: 'boolean' },
      mutate: { type: 'boolean' },
      'test-cmd': { type: 'string' },
      'fail-under': { type: 'string' },
      strict: { type: 'boolean' },
      'require-spec-match': { type: 'boolean' },
      spec: { type: 'string' },
      llm: { type: 'boolean' },
      provider: { type: 'string' },
      model: { type: 'string' },
      'post-pr-comment': { type: 'boolean' },
      'post-check-run': { type: 'boolean' },
      sha: { type: 'string' },
      cloud: { type: 'string' },
      upload: { type: 'string' },
      branch: { type: 'string' },
      'repo-slug': { type: 'string' },
      pr: { type: 'string' },
      json: { type: 'boolean' },
      markdown: { type: 'boolean' },
    },
  });

  if (values.version) {
    console.log(CLI_VERSION);
    return;
  }

  const command = positionals[0] ?? 'help';
  const repoRoot = path.resolve(values.repo ?? process.cwd());

  if (command === 'help' || values.help) {
    printHelp();
    return;
  }

  if (command === 'init') {
    runInit(repoRoot);
    return;
  }

  if (command === 'mcp') {
    await startMcpServer();
    return;
  }

  if (command === 'check') {
    let failUnder: number | undefined;
    if (values['fail-under'] !== undefined) {
      const parsed = Number(values['fail-under']);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        throw new Error(`Invalid --fail-under value "${values['fail-under']}". Expected 0-100.`);
      }
      failUnder = parsed;
    }

    let provider: LlmProvider | undefined;
    if (values.provider !== undefined) {
      if (!VALID_PROVIDERS.has(values.provider as LlmProvider)) {
        throw new Error(
          `Invalid --provider "${values.provider}". Expected openai, anthropic, or gemini.`,
        );
      }
      provider = values.provider as LlmProvider;
    }

    const cloudUrl = values.cloud;
    const uploadUrl = values.upload ?? cloudUrl;
    const repoSlug =
      values['repo-slug'] ?? process.env.GITHUB_REPOSITORY ?? inferRepoSlugFromGit(repoRoot);

    let cloudSpecMarkdown: string | undefined;
    let blockOnMockAbuse: boolean | undefined = values.strict ? true : undefined;
    let blockOnVacuous: boolean | undefined;
    let requireSpecMatch: boolean | undefined = values['require-spec-match'] ? true : undefined;
    let shouldMutate = Boolean(values.mutate);

    if (cloudUrl) {
      const synced = await fetchCloudPolicyAndSpecs({
        cloudUrl,
        repoSlug,
        token: process.env.SPECPROOF_CLOUD_TOKEN,
      });
      failUnder =
        failUnder === undefined
          ? synced.policy.minMutationScore
          : Math.max(failUnder, synced.policy.minMutationScore);
      blockOnMockAbuse = blockOnMockAbuse ?? synced.policy.blockOnMockAbuse;
      blockOnVacuous = synced.policy.blockOnVacuous;
      requireSpecMatch = requireSpecMatch ?? synced.policy.requireSpecMatch;
      if (synced.policy.minMutationScore > 0) {
        shouldMutate = true;
      }
      if (!values.spec && synced.specs.length > 0) {
        cloudSpecMarkdown = synced.specs
          .map((s) => `## ${s.externalId}: ${s.title}\n${s.checklistMarkdown}`)
          .join('\n\n');
      }
    }

    const report = await verifyRepositoryAsync({
      repoRoot,
      configPath: values.config,
      baseRef: values.base,
      allFiles: Boolean(values.all),
      mutate: shouldMutate,
      specPath: values.spec,
      specMarkdown: cloudSpecMarkdown,
      testCommand: values['test-cmd'],
      failUnderMutationScore: failUnder,
      useLlm: Boolean(values.llm),
      llmProvider: provider,
      llmModel: values.model,
      blockOnMockAbuse,
      blockOnVacuous,
      requireSpecMatch,
    });

    if (values.json) {
      console.log(JSON.stringify(report, null, 2));
    } else if (values.markdown) {
      console.log(formatMarkdownReport(report));
    } else {
      console.log(formatTerminalReport(report));
    }

    if (values['post-pr-comment']) {
      const token = process.env.GITHUB_TOKEN;
      const prNumber = resolvePrNumber(values.pr);
      if (!token || !repoSlug || prNumber === undefined) {
        throw new Error(
          'Missing PR comment context: ensure GITHUB_TOKEN, --repo-slug (or GITHUB_REPOSITORY), and --pr (or PR_NUMBER/GITHUB_REF) are set.',
        );
      }

      const commentResult = await postOrUpdatePrComment({
        repoSlug,
        prNumber,
        token,
        markdownBody: formatMarkdownReport(report),
      });
      console.error(
        `SpecProof PR comment ${commentResult.action} (#${commentResult.commentId}).`,
      );
    }

    if (values['post-check-run']) {
      const token = process.env.GITHUB_TOKEN;
      const headSha = values.sha ?? process.env.GITHUB_SHA;
      if (!token || !repoSlug || !headSha) {
        throw new Error(
          'Missing Check Run context: ensure GITHUB_TOKEN, --repo-slug (or git origin), and --sha (or GITHUB_SHA) are set.',
        );
      }
      const checkRes = await publishGitHubCheckRun({
        repoSlug,
        headSha,
        token,
        report,
        markdownSummary: formatMarkdownReport(report),
      });
      console.error(
        `Published GitHub Check Run #${checkRes.id} (${checkRes.annotationsCount} annotations).`,
      );
    }

    if (uploadUrl) {
      const prNumber = resolvePrNumber(values.pr);
      const uploaded = await uploadVerificationReport({
        cloudUrl: uploadUrl,
        report,
        repoSlug,
        branch: values.branch ?? process.env.GITHUB_HEAD_REF,
        prNumber,
        token: process.env.SPECPROOF_CLOUD_TOKEN,
      });
      console.error(`Uploaded verification proof to ${uploaded.url}`);
    }

    if (!report.passed) {
      process.exitCode = 1;
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
