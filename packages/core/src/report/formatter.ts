import type { VerificationReport } from '../types.js';

export function formatTerminalReport(report: VerificationReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('=== SpecProof Verification Report ===');
  lines.push(`Repository : ${report.repoRoot}`);
  lines.push(`Status     : ${report.passed ? 'PASSED' : 'FAILED'}`);
  lines.push(`Diff Files : ${report.diffFiles.length}`);
  lines.push(
    `Test Scan  : ${report.integrity.testFilesScanned} test files, ${report.integrity.totalTests} tests, ${report.integrity.totalAssertions} assertions, ${report.integrity.totalMocks} mocks`,
  );

  if (report.integrity.findings.length > 0) {
    lines.push('');
    lines.push(`Integrity Findings (${report.integrity.findings.length}):`);
    for (const f of report.integrity.findings) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.file}:${f.line}:${f.column} (${f.ruleId}) - ${f.message}`);
    }
  } else {
    lines.push('Integrity  : Clean (no mock abuse, vacuous assertions, or swallowed errors found)');
  }

  if (report.mutation) {
    lines.push('');
    lines.push(
      `Diff Mutation Score: ${report.mutation.score.toFixed(1)}% (${report.mutation.killed} killed, ${report.mutation.survived} survived, ${report.mutation.timeouts} timeouts, ${report.mutation.totalMutants} total) in ${(report.mutation.durationMs / 1000).toFixed(2)}s`,
    );
    const survived = report.mutation.results.filter((r) => r.status === 'survived');
    if (survived.length > 0) {
      lines.push('Survived Mutants (tests still passed after breaking this logic):');
      for (const m of survived) {
        lines.push(`  - ${m.file}:${m.line}:${m.column} [${m.operator}] "${m.original}" -> "${m.mutated}"`);
      }
    }
  }

  if (report.specCoverage) {
    lines.push('');
    const evalMode = report.specCoverage.evaluatedBy ? ` [${report.specCoverage.evaluatedBy}]` : '';
    lines.push(
      `Spec Coverage${evalMode}: ${report.specCoverage.coveredCount}/${report.specCoverage.totalRequirements} requirements matched (${(report.specCoverage.coverageRatio * 100).toFixed(0)}%)`,
    );
    for (const req of report.specCoverage.requirements) {
      const tag = req.covered ? '[COVERED]' : '[MISSING]';
      const note = req.llmReason ? ` — ${req.llmReason}` : '';
      lines.push(`  ${tag} ${req.id}: ${req.text}${note}`);
    }
  }

  if (report.failureReasons.length > 0) {
    lines.push('');
    lines.push('Gate Failure Reasons:');
    for (const reason of report.failureReasons) {
      lines.push(`  * ${reason}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function formatMarkdownReport(report: VerificationReport): string {
  const badge = report.passed ? 'PASSED' : 'FAILED';
  const lines: string[] = [];

  lines.push(`## SpecProof Verification Gate: ${badge}`);
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| :--- | :--- |');
  lines.push(`| Changed Files | ${report.diffFiles.length} |`);
  lines.push(`| Test Integrity Findings | ${report.integrity.findings.length} |`);

  if (report.mutation) {
    lines.push(
      `| Diff Mutation Score | **${report.mutation.score.toFixed(1)}%** (${report.mutation.killed}/${report.mutation.totalMutants} killed) |`,
    );
  }

  if (report.specCoverage) {
    lines.push(
      `| Spec Coverage | ${report.specCoverage.coveredCount}/${report.specCoverage.totalRequirements} (${(report.specCoverage.coverageRatio * 100).toFixed(0)}%) |`,
    );
  }

  if (report.integrity.findings.length > 0) {
    lines.push('');
    lines.push('### Test & Code Integrity Findings');
    for (const f of report.integrity.findings) {
      lines.push(`- **${f.severity.toUpperCase()}** \`${f.file}:${f.line}\` (\`${f.ruleId}\`): ${f.message}`);
    }
  }

  const survived = report.mutation?.results.filter((r) => r.status === 'survived') ?? [];
  if (survived.length > 0) {
    lines.push('');
    lines.push('### Survived Mutants (Untested Edge Cases)');
    for (const m of survived) {
      lines.push(`- \`${m.file}:${m.line}\` (${m.operator}): \`${m.original}\` -> \`${m.mutated}\``);
    }
  }

  if (report.specCoverage && report.specCoverage.requirements.length > 0) {
    lines.push('');
    lines.push(`### Spec Requirement Coverage (${report.specCoverage.evaluatedBy ?? 'deterministic'})`);
    for (const req of report.specCoverage.requirements) {
      const icon = req.covered ? '[x]' : '[ ]';
      const note = req.llmReason ? ` — _${req.llmReason}_` : '';
      lines.push(`- ${icon} **${req.id}**: ${req.text}${note}`);
    }
  }

  return lines.join('\n');
}
