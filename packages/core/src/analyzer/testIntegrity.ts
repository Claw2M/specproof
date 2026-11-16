import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { isLineInRanges } from '../diff/gitDiff.js';
import { resolveContainedPath } from '../security/pathSafety.js';
import type {
  FileTestMetrics,
  IntegrityFinding,
  IntegritySummary,
  LineRange,
  SpecProofConfig,
} from '../types.js';
import { analyzeGoTestFile } from './goIntegrity.js';
import { analyzePythonSourceFile, analyzePythonTestFile } from './pythonIntegrity.js';

const TS_TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/i;
const PY_TEST_FILE_RE = /(?:^|\/)test_[^/]+\.py$|_test\.py$/i;
const GO_TEST_FILE_RE = /_test\.go$/i;
const SOURCE_FILE_RE = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs|py|go)$/i;

const TEST_BLOCK_NAMES = new Set(['it', 'test', 'xit', 'xtest']);
const SKIP_CONTAINERS = new Set(['it', 'test', 'describe']);
const MOCK_CALL_NAMES = new Set(['mock', 'spyOn', 'fn']);
const ASSERTION_METHODS = new Set([
  'toBe',
  'toEqual',
  'toStrictEqual',
  'toBeTruthy',
  'toBeFalsy',
  'toBeDefined',
  'toBeNull',
  'toBeUndefined',
  'toMatchObject',
  'toContain',
  'toThrow',
  'toHaveLength',
  'ok',
  'equal',
  'strictEqual',
  'deepEqual',
  'deepStrictEqual',
  'notStrictEqual',
  'throws',
  'rejects',
  'doesNotThrow',
  'match',
  'fail',
]);

export interface AnalyzeOptions {
  /**
   * Optional map of relative path -> added line ranges.
   * When omitted, every line in the provided files is analyzed.
   */
  diffRangesByFile?: Map<string, LineRange[]>;
}

export function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    TS_TEST_FILE_RE.test(normalized) ||
    PY_TEST_FILE_RE.test(normalized) ||
    GO_TEST_FILE_RE.test(normalized)
  );
}

export function isSupportedSourceFile(filePath: string): boolean {
  return SOURCE_FILE_RE.test(filePath);
}

/**
 * Analyzes TypeScript/JavaScript and Python source/test files for AI-era test integrity
 * anti-patterns: vacuous assertions, empty tests, skipped tests, mock abuse, and swallowed errors.
 */
export function analyzeFilesIntegrity(
  repoRoot: string,
  relativeFiles: string[],
  config: SpecProofConfig,
  options: AnalyzeOptions = {},
): IntegritySummary {
  const findings: IntegrityFinding[] = [];
  const fileMetrics: FileTestMetrics[] = [];
  let filesScanned = 0;
  let testFilesScanned = 0;
  let totalTests = 0;
  let totalAssertions = 0;
  let totalMocks = 0;

  for (const relPath of relativeFiles) {
    const normalized = relPath.replace(/\\/g, '/');
    if (!isSupportedSourceFile(normalized)) {
      continue;
    }

    let fullPath: string;
    try {
      fullPath = resolveContainedPath(repoRoot, normalized);
    } catch {
      continue;
    }
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      continue;
    }

    filesScanned += 1;
    const content = fs.readFileSync(fullPath, 'utf8');
    const activeRanges = options.diffRangesByFile?.get(normalized);
    const isTest = isTestFile(normalized);

    if (normalized.endsWith('.go')) {
      if (isTest) {
        testFilesScanned += 1;
        const metrics = analyzeGoTestFile(content, normalized, findings, activeRanges);
        fileMetrics.push(metrics);
        totalTests += metrics.testCount;
        totalAssertions += metrics.assertionCount;
      }
      continue;
    }

    if (normalized.endsWith('.py')) {
      if (isTest) {
        testFilesScanned += 1;
        const metrics = analyzePythonTestFile(
          content,
          normalized,
          config,
          findings,
          activeRanges,
        );
        fileMetrics.push(metrics);
        totalTests += metrics.testCount;
        totalAssertions += metrics.assertionCount;
        totalMocks += metrics.mockCount;
      } else {
        analyzePythonSourceFile(content, normalized, findings, activeRanges);
      }
      continue;
    }

    const sourceFile = ts.createSourceFile(
      normalized,
      content,
      ts.ScriptTarget.Latest,
      true,
    );

    if (isTest) {
      testFilesScanned += 1;
      const metrics = analyzeTestSourceFile(
        sourceFile,
        normalized,
        config,
        findings,
        activeRanges,
      );
      fileMetrics.push(metrics);
      totalTests += metrics.testCount;
      totalAssertions += metrics.assertionCount;
      totalMocks += metrics.mockCount;
    } else {
      analyzeProductionSourceFile(sourceFile, normalized, findings, activeRanges);
    }
  }

  return {
    filesScanned,
    testFilesScanned,
    totalTests,
    totalAssertions,
    totalMocks,
    findings,
    fileMetrics,
  };
}

function getLineCol(sourceFile: ts.SourceFile, pos: number): { line: number; column: number } {
  const lc = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: lc.line + 1, column: lc.character + 1 };
}

function shouldReportAtLine(line: number, activeRanges?: LineRange[]): boolean {
  if (activeRanges === undefined) {
    return true;
  }
  if (activeRanges.length === 0) {
    return false;
  }
  return isLineInRanges(line, activeRanges);
}

function doesNodeOverlapRanges(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  activeRanges?: LineRange[],
): boolean {
  if (activeRanges === undefined) {
    return true;
  }
  if (activeRanges.length === 0) {
    return false;
  }
  const startLine = getLineCol(sourceFile, node.getStart(sourceFile)).line;
  const endLine = getLineCol(sourceFile, node.getEnd()).line;
  return activeRanges.some((r) => startLine <= r.end && endLine >= r.start);
}

function findTestCallback(args: ts.NodeArray<ts.Expression>): ts.ArrowFunction | ts.FunctionExpression | undefined {
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) {
      return arg;
    }
  }
  return undefined;
}

function analyzeTestSourceFile(
  sourceFile: ts.SourceFile,
  filePath: string,
  config: SpecProofConfig,
  findings: IntegrityFinding[],
  activeRanges?: LineRange[],
): FileTestMetrics {
  let testCount = 0;
  let assertionCount = 0;
  let effectiveAssertionCount = 0;
  let mockCount = 0;
  let skippedCount = 0;

  function visit(node: ts.Node, inSkippedScope: boolean): void {
    let nextSkippedScope = inSkippedScope;

    if (ts.isCallExpression(node)) {
      const { line, column } = getLineCol(sourceFile, node.getStart(sourceFile));
      const exprText = node.expression.getText(sourceFile);

      if (isSkippedTestCall(node.expression)) {
        skippedCount += 1;
        nextSkippedScope = true;
        if (shouldReportAtLine(line, activeRanges)) {
          findings.push({
            ruleId: 'skipped-test',
            severity: 'warning',
            file: filePath,
            line,
            column,
            message: `Skipped test block (${exprText}) hides unverified behavior.`,
            snippet: exprText,
          });
        }
      }

      if (isTestCaseCall(node.expression)) {
        testCount += 1;
        const callback = findTestCallback(node.arguments);
        if (callback) {
          const assertionsInside = countAssertionsInNode(callback.body, sourceFile);
          if (assertionsInside === 0 && doesNodeOverlapRanges(node, sourceFile, activeRanges)) {
            findings.push({
              ruleId: 'empty-test',
              severity: 'error',
              file: filePath,
              line,
              column,
              message: `Test case has no assertions (expect/assert), so it passes without verifying behavior.`,
              snippet: node.arguments[0]?.getText(sourceFile),
            });
          }
        }
      }

      if (isAssertionCall(node, sourceFile)) {
        assertionCount += 1;
        const vacuousReason = detectVacuousAssertion(node, sourceFile);
        if (vacuousReason) {
          if (!nextSkippedScope && shouldReportAtLine(line, activeRanges)) {
            findings.push({
              ruleId: 'vacuous-assertion',
              severity: 'error',
              file: filePath,
              line,
              column,
              message: vacuousReason,
              snippet: node.getText(sourceFile).slice(0, 120),
            });
          }
        } else if (!nextSkippedScope) {
          effectiveAssertionCount += 1;
        }
      }

      if (!nextSkippedScope && isMockCall(node.expression)) {
        if (shouldReportAtLine(line, activeRanges)) {
          mockCount += 1;
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, nextSkippedScope));
  }

  visit(sourceFile, false);

  if (mockCount >= config.minMocksBeforeFlagging) {
    const ratio = effectiveAssertionCount === 0 ? Infinity : mockCount / effectiveAssertionCount;
    if (ratio > config.mockToAssertionMaxRatio) {
      findings.push({
        ruleId: 'mock-abuse',
        severity: 'warning',
        file: filePath,
        line: 1,
        column: 1,
        message: `High mock-to-assertion ratio (${mockCount} mocks vs ${effectiveAssertionCount} effective assertions). Tests may only verify mocked stubs instead of real logic.`,
      });
    }
  }

  return {
    file: filePath,
    testCount,
    assertionCount,
    mockCount,
    skippedCount,
  };
}

function analyzeProductionSourceFile(
  sourceFile: ts.SourceFile,
  filePath: string,
  findings: IntegrityFinding[],
  activeRanges?: LineRange[],
): void {
  function visit(node: ts.Node): void {
    if (ts.isCatchClause(node)) {
      const { line, column } = getLineCol(sourceFile, node.getStart(sourceFile));
      if (shouldReportAtLine(line, activeRanges) && isSwallowedCatchBlock(node.block, sourceFile)) {
        findings.push({
          ruleId: 'swallowed-error',
          severity: 'warning',
          file: filePath,
          line,
          column,
          message: 'Swallowed exception in catch block (empty or logging-only without recovery/rethrow).',
          snippet: node.block.getText(sourceFile).slice(0, 120),
        });
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'catch' &&
      node.arguments[0] &&
      (ts.isArrowFunction(node.arguments[0]) || ts.isFunctionExpression(node.arguments[0]))
    ) {
      const handlerBody = node.arguments[0].body;
      if (ts.isBlock(handlerBody) && isSwallowedCatchBlock(handlerBody, sourceFile)) {
        const { line, column } = getLineCol(sourceFile, node.getStart(sourceFile));
        if (shouldReportAtLine(line, activeRanges)) {
          findings.push({
            ruleId: 'swallowed-error',
            severity: 'warning',
            file: filePath,
            line,
            column,
            message: 'Swallowed Promise rejection in .catch() handler.',
            snippet: node.getText(sourceFile).slice(0, 120),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function isSwallowedCatchBlock(block: ts.Block, sourceFile: ts.SourceFile): boolean {
  const meaningful = block.statements.filter((stmt) => !ts.isEmptyStatement(stmt));
  if (meaningful.length === 0) {
    return true;
  }

  return meaningful.every((stmt) => {
    if (ts.isReturnStatement(stmt) && !stmt.expression) {
      return true;
    }
    if (!ts.isExpressionStatement(stmt)) {
      return false;
    }
    const text = stmt.expression.getText(sourceFile).trim();
    return /^console\.(log|warn|error|info|debug)\(/.test(text);
  });
}

function isTestCaseCall(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) {
    return TEST_BLOCK_NAMES.has(expr.text);
  }
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    return (
      TEST_BLOCK_NAMES.has(expr.expression.text) &&
      (expr.name.text === 'only' || expr.name.text === 'concurrent' || expr.name.text === 'each')
    );
  }
  if (
    ts.isCallExpression(expr) &&
    ts.isPropertyAccessExpression(expr.expression) &&
    ts.isIdentifier(expr.expression.expression)
  ) {
    return (
      TEST_BLOCK_NAMES.has(expr.expression.expression.text) &&
      expr.expression.name.text === 'each'
    );
  }
  return false;
}

function isSkippedTestCall(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) {
    return expr.text === 'xit' || expr.text === 'xtest' || expr.text === 'xdescribe';
  }
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    return SKIP_CONTAINERS.has(expr.expression.text) && expr.name.text === 'skip';
  }
  return false;
}

function isMockCall(expr: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(expr)) {
    if (
      ts.isIdentifier(expr.expression) &&
      (expr.expression.text === 'vi' || expr.expression.text === 'jest') &&
      MOCK_CALL_NAMES.has(expr.name.text)
    ) {
      return true;
    }
  }
  return false;
}

function isAssertRoot(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr) && expr.text === 'assert') {
    return true;
  }
  return (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === 'assert' &&
    expr.name.text === 'strict'
  );
}

function isAssertionCall(node: ts.CallExpression, sourceFile: ts.SourceFile): boolean {
  const expr = node.expression;
  if (ts.isIdentifier(expr) && expr.text === 'assert') {
    return true;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    if (isAssertRoot(expr.expression)) {
      return ASSERTION_METHODS.has(expr.name.text);
    }
    const rootCall = unwrapExpectRoot(expr);
    if (rootCall) {
      return ASSERTION_METHODS.has(expr.name.text) || expr.getText(sourceFile).includes('expect');
    }
  }
  return false;
}

function unwrapExpectRoot(expr: ts.Expression): ts.CallExpression | null {
  let current: ts.Expression = expr;
  while (ts.isPropertyAccessExpression(current)) {
    current = current.expression;
  }
  if (ts.isCallExpression(current)) {
    if (ts.isIdentifier(current.expression) && current.expression.text === 'expect') {
      return current;
    }
    if (
      ts.isPropertyAccessExpression(current.expression) &&
      ts.isIdentifier(current.expression.expression) &&
      current.expression.expression.text === 'expect' &&
      (current.expression.name.text === 'soft' || current.expression.name.text === 'poll')
    ) {
      return current;
    }
  }
  return null;
}

function countAssertionsInNode(root: ts.Node, sourceFile: ts.SourceFile): number {
  let count = 0;
  function walk(node: ts.Node): void {
    if (ts.isCallExpression(node) && isAssertionCall(node, sourceFile)) {
      count += 1;
    }
    ts.forEachChild(node, walk);
  }
  walk(root);
  return count;
}

function detectVacuousAssertion(node: ts.CallExpression, sourceFile: ts.SourceFile): string | null {
  const expr = node.expression;

  if (
    (ts.isIdentifier(expr) && expr.text === 'assert') ||
    (ts.isPropertyAccessExpression(expr) && isAssertRoot(expr.expression))
  ) {
    const methodName = ts.isPropertyAccessExpression(expr) ? expr.name.text : 'ok';
    if (methodName === 'ok') {
      const arg = node.arguments[0];
      if (arg && isStaticLiteral(arg)) {
        return `Vacuous assertion (${node.getText(sourceFile)}) always evaluates statically.`;
      }
    }
    if (
      methodName === 'equal' ||
      methodName === 'notEqual' ||
      methodName === 'strictEqual' ||
      methodName === 'notStrictEqual' ||
      methodName === 'deepEqual' ||
      methodName === 'deepStrictEqual'
    ) {
      const left = node.arguments[0];
      const right = node.arguments[1];
      if (left && right && isStaticLiteral(left) && isStaticLiteral(right)) {
        return `Vacuous assertion (${node.getText(sourceFile)}) compares static literals.`;
      }
    }
  }

  if (ts.isPropertyAccessExpression(expr)) {
    const expectCall = unwrapExpectRoot(expr);
    if (!expectCall) {
      return null;
    }
    const actualArg = expectCall.arguments[0];
    if (!actualArg || !isStaticLiteral(actualArg)) {
      return null;
    }

    const matcher = expr.name.text;
    const expectedArg = node.arguments[0];
    if (
      matcher === 'toBeTruthy' ||
      matcher === 'toBeFalsy' ||
      matcher === 'toBeDefined' ||
      matcher === 'toBeNull' ||
      matcher === 'toBeUndefined'
    ) {
      return `Vacuous assertion: expect(${actualArg.getText(sourceFile)}).${matcher}() never exercises application code.`;
    }
    if (expectedArg && isStaticLiteral(expectedArg)) {
      return `Vacuous assertion: comparing static literals (${actualArg.getText(sourceFile)} vs ${expectedArg.getText(sourceFile)}).`;
    }
  }

  return null;
}

function isStaticLiteral(node: ts.Expression): boolean {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(node) && node.text === 'undefined')
  ) {
    return true;
  }
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return true;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.every((el) => !ts.isSpreadElement(el) && isStaticLiteral(el));
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every(
      (prop) => ts.isPropertyAssignment(prop) && isStaticLiteral(prop.initializer),
    );
  }
  return false;
}
