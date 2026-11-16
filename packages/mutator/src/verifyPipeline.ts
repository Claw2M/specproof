import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeFilesIntegrity,
  collectProjectFiles,
  evaluateSpecCoverage,
  evaluateSpecWithByokLlm,
  getGitDiff,
  loadConfig,
  resolveContainedPath,
  type ByokEvaluatorOptions,
  type FileDiff,
  type IntegritySummary,
  type LineRange,
  type LlmProvider,
  type MutationSummary,
  type SpecCoverageSummary,
  type VerificationReport,
} from '@specproof/core';
import { generateDiffMutants } from './mutantGenerator.js';
import { runDiffMutations, runDiffMutationsAsync } from './mutationRunner.js';

export interface VerifyRepositoryOptions {
  repoRoot: string;
  configPath?: string;
  baseRef?: string;
  allFiles?: boolean;
  mutate?: boolean;
  specPath?: string;
  specMarkdown?: string;
  failUnderMutationScore?: number;
  testCommand?: string;
  useLlm?: boolean;
  llmProvider?: LlmProvider;
  llmModel?: string;
  byokOptions?: ByokEvaluatorOptions;
  blockOnMockAbuse?: boolean;
  blockOnVacuous?: boolean;
  requireSpecMatch?: boolean;
}

function evaluateFailureReasons(
  integrity: IntegritySummary,
  mutation: MutationSummary | undefined,
  specCoverage: SpecCoverageSummary | undefined,
  failUnder: number,
  effectivePolicy: {
    blockOnVacuous: boolean;
    blockOnMockAbuse: boolean;
    requireSpecMatch: boolean;
  },
): string[] {
  const reasons: string[] = [];
  const errorFindings = integrity.findings.filter((f) => {
    if (f.severity !== 'error') {
      return false;
    }
    if (!effectivePolicy.blockOnVacuous && (f.ruleId === 'vacuous-assertion' || f.ruleId === 'empty-test')) {
      return false;
    }
    return true;
  });

  if (errorFindings.length > 0) {
    reasons.push(`${errorFindings.length} critical test integrity error(s) detected.`);
  }

  if (effectivePolicy.blockOnMockAbuse) {
    const mockAbuseCount = integrity.findings.filter((f) => f.ruleId === 'mock-abuse').length;
    if (mockAbuseCount > 0) {
      reasons.push(`${mockAbuseCount} mock-abuse finding(s) blocked by org policy.`);
    }
  }

  if (mutation && mutation.totalMutants > 0 && mutation.score < failUnder) {
    reasons.push(
      `Diff mutation score ${mutation.score.toFixed(1)}% is below threshold ${failUnder}%.`,
    );
  }

  if (effectivePolicy.requireSpecMatch) {
    if (!specCoverage) {
      reasons.push('Spec coverage required by policy, but no SPEC.md or synced specs were found.');
    } else if (
      specCoverage.totalRequirements > 0 &&
      specCoverage.coveredCount < specCoverage.totalRequirements
    ) {
      reasons.push(
        `Spec coverage ${specCoverage.coveredCount}/${specCoverage.totalRequirements} is incomplete (requireSpecMatch policy).`,
      );
    }
  }

  return reasons;
}

function buildSnippetDiffsForFiles(repoRoot: string, files: string[]): FileDiff[] {
  const diffs: FileDiff[] = [];
  for (const rel of files.slice(0, 25)) {
    const fullPath = resolveContainedPath(repoRoot, rel);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      continue;
    }
    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/).slice(0, 60);
    diffs.push({
      path: rel,
      status: 'modified',
      addedRanges: [{ start: 1, end: Math.max(1, lines.length) }],
      addedLines: lines,
    });
  }
  return diffs;
}

/**
 * Runs the unified SpecProof verification pipeline: git diff scoping, AST test/code
 * integrity checks, optional diff-scoped micro-mutation, and optional spec coverage mapping.
 */
export function verifyRepository(options: VerifyRepositoryOptions): VerificationReport {
  const repoRoot = path.resolve(options.repoRoot);
  const config = loadConfig(repoRoot, options.configPath);
  const effectiveTestCommand = options.testCommand ?? config.testCommand;
  const failUnder = options.failUnderMutationScore ?? config.failUnderMutationScore;
  const effectivePolicy = {
    blockOnVacuous: options.blockOnVacuous ?? config.blockOnVacuous,
    blockOnMockAbuse: options.blockOnMockAbuse ?? config.blockOnMockAbuse,
    requireSpecMatch: options.requireSpecMatch ?? config.requireSpecMatch,
  };

  const hasGitRepo = fs.existsSync(path.join(repoRoot, '.git'));
  const diffFiles: FileDiff[] = hasGitRepo ? getGitDiff(repoRoot, { baseRef: options.baseRef }) : [];
  const diffRangesByFile = new Map<string, LineRange[]>();
  for (const file of diffFiles) {
    diffRangesByFile.set(file.path.replace(/\\/g, '/'), file.addedRanges);
  }

  const scanAll = Boolean(options.allFiles) || !hasGitRepo;
  const targetFiles = scanAll
    ? collectProjectFiles(repoRoot, config.ignorePatterns)
    : diffFiles.map((f) => f.path.replace(/\\/g, '/'));

  const integrity = analyzeFilesIntegrity(repoRoot, targetFiles, config, {
    diffRangesByFile: scanAll ? undefined : diffRangesByFile,
  });

  let mutation: MutationSummary | undefined;
  if (options.mutate && targetFiles.length > 0) {
    const mutationTargets: FileDiff[] = scanAll
      ? targetFiles.map((p) => ({
          path: p,
          status: 'modified',
          addedRanges: [],
          addedLines: [],
        }))
      : diffFiles;

    const candidates = generateDiffMutants(
      repoRoot,
      mutationTargets,
      config.maxMutantsPerRun,
      scanAll,
    );

    mutation = runDiffMutations({
      repoRoot,
      mutants: candidates,
      testCommand: effectiveTestCommand,
      timeoutMs: config.mutationTimeoutMs,
      ignorePatterns: config.ignorePatterns,
    });
  }

  let specCoverage: SpecCoverageSummary | undefined;
  const resolvedSpecPath = options.specPath ?? config.specFile;
  let specText = options.specMarkdown;
  if (!specText && resolvedSpecPath) {
    const containedSpecPath = resolveContainedPath(repoRoot, resolvedSpecPath);
    if (fs.existsSync(containedSpecPath)) {
      specText = fs.readFileSync(containedSpecPath, 'utf8');
    }
  }

  if (specText) {
    const specDiffs: FileDiff[] =
      !scanAll && diffFiles.length > 0
        ? diffFiles
        : buildSnippetDiffsForFiles(repoRoot, targetFiles);
    specCoverage = evaluateSpecCoverage(repoRoot, specText, specDiffs, resolvedSpecPath);
  }

  const failureReasons = evaluateFailureReasons(
    integrity,
    mutation,
    specCoverage,
    failUnder,
    effectivePolicy,
  );

  return {
    timestamp: new Date().toISOString(),
    repoRoot,
    baseRef: options.baseRef,
    diffFiles: scanAll && diffFiles.length === 0 ? buildSnippetDiffsForFiles(repoRoot, targetFiles) : diffFiles,
    integrity,
    mutation,
    specCoverage,
    passed: failureReasons.length === 0,
    failureReasons,
  };
}

/**
 * Asynchronous verification entrypoint supporting parallel mutation worker pools
 * and BYOK semantic LLM spec evaluation.
 */
export async function verifyRepositoryAsync(
  options: VerifyRepositoryOptions,
): Promise<VerificationReport> {
  const report = verifyRepository({ ...options, mutate: false });
  const config = loadConfig(report.repoRoot, options.configPath);
  const failUnder = options.failUnderMutationScore ?? config.failUnderMutationScore;
  const effectivePolicy = {
    blockOnVacuous: options.blockOnVacuous ?? config.blockOnVacuous,
    blockOnMockAbuse: options.blockOnMockAbuse ?? config.blockOnMockAbuse,
    requireSpecMatch: options.requireSpecMatch ?? config.requireSpecMatch,
  };

  let mutation: MutationSummary | undefined;
  const hasGitRepo = fs.existsSync(path.join(report.repoRoot, '.git'));
  const scanAll = Boolean(options.allFiles) || !hasGitRepo;

  if (options.mutate) {
    const targetFiles = scanAll
      ? collectProjectFiles(report.repoRoot, config.ignorePatterns)
      : report.diffFiles.map((f) => f.path.replace(/\\/g, '/'));

    if (targetFiles.length > 0) {
      const mutationTargets: FileDiff[] = scanAll
        ? targetFiles.map((p) => ({
            path: p,
            status: 'modified',
            addedRanges: [],
            addedLines: [],
          }))
        : report.diffFiles;

      const candidates = generateDiffMutants(
        report.repoRoot,
        mutationTargets,
        config.maxMutantsPerRun,
        scanAll,
      );

      mutation = await runDiffMutationsAsync({
        repoRoot: report.repoRoot,
        mutants: candidates,
        testCommand: options.testCommand ?? config.testCommand,
        timeoutMs: config.mutationTimeoutMs,
        ignorePatterns: config.ignorePatterns,
      });
    }
  }

  let specCoverage = report.specCoverage;
  if (options.useLlm && specCoverage) {
    specCoverage = await evaluateSpecWithByokLlm(
      specCoverage,
      report.diffFiles,
      mutation,
      {
        provider: options.llmProvider ?? config.llmProvider,
        model: options.llmModel ?? config.llmModel,
        ...options.byokOptions,
      },
    );
  }

  const failureReasons = evaluateFailureReasons(
    report.integrity,
    mutation,
    specCoverage,
    failUnder,
    effectivePolicy,
  );

  return {
    ...report,
    mutation,
    specCoverage,
    passed: failureReasons.length === 0,
    failureReasons,
  };
}
