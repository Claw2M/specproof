import { isLineInRanges } from '../diff/gitDiff.js';
import type { FileTestMetrics, IntegrityFinding, LineRange } from '../types.js';

const GO_TEST_FUNC_RE = /^\s*func\s+(Test[A-Za-z0-9_]*)\s*\(/;
const GO_SKIP_RE = /\b(?:t|b)\.(?:Skip|Skipf|SkipNow)\s*\(/;
const GO_ASSERTION_RE =
  /\b(?:t\.(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)|assert\.\w+|require\.\w+)\s*\(/;
const GO_VACUOUS_RE =
  /\b(?:assert|require)\.(?:True\s*\(\s*t\s*,\s*true\s*\)|False\s*\(\s*t\s*,\s*false\s*\)|Equal\s*\(\s*t\s*,\s*(-?\d+|"[^"]*")\s*,\s*\1\s*\))/;

function shouldReport(line: number, activeRanges?: LineRange[]): boolean {
  if (activeRanges === undefined) {
    return true;
  }
  if (activeRanges.length === 0) {
    return false;
  }
  return isLineInRanges(line, activeRanges);
}

/**
 * Masks Go line/block comments and string literals while keeping exact line structure.
 */
export function maskGoStringsAndComments(source: string): string {
  const chars = source.split('');
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (ch === '/' && next === '/') {
      while (i < chars.length && chars[i] !== '\n') {
        chars[i] = ' ';
        i += 1;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < chars.length) {
        if (chars[i] === '*' && chars[i + 1] === '/') {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          break;
        }
        if (chars[i] !== '\n') {
          chars[i] = ' ';
        }
        i += 1;
      }
      continue;
    }
    if (ch === '"' || ch === '`') {
      const quote = ch;
      chars[i] = ' ';
      i += 1;
      while (i < chars.length) {
        if (quote === '"' && chars[i] === '\\') {
          chars[i] = ' ';
          if (i + 1 < chars.length && chars[i + 1] !== '\n') {
            chars[i + 1] = ' ';
          }
          i += 2;
          continue;
        }
        if (chars[i] === quote) {
          chars[i] = ' ';
          i += 1;
          break;
        }
        if (chars[i] !== '\n') {
          chars[i] = ' ';
        }
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return chars.join('');
}

/**
 * Analyzes a Go test file (`*_test.go`) for skipped tests, empty tests, and vacuous assertions.
 */
export function analyzeGoTestFile(
  content: string,
  filePath: string,
  findings: IntegrityFinding[],
  activeRanges?: LineRange[],
): FileTestMetrics {
  const rawLines = content.split(/\r?\n/);
  const maskedLines = maskGoStringsAndComments(content).split(/\r?\n/);

  let testCount = 0;
  let assertionCount = 0;
  let skippedCount = 0;

  let activeTestName: string | null = null;
  let activeTestLine = 0;
  let braceDepth = 0;
  let seenOpeningBrace = false;
  let testHasAssertion = false;
  let testWasSkipped = false;

  for (let idx = 0; idx < rawLines.length; idx += 1) {
    const raw = rawLines[idx] ?? '';
    const masked = maskedLines[idx] ?? '';
    const lineNum = idx + 1;

    if (activeTestName === null) {
      const match = GO_TEST_FUNC_RE.exec(masked);
      if (match) {
        testCount += 1;
        activeTestName = match[1] ?? 'Test';
        activeTestLine = lineNum;
        braceDepth = 0;
        seenOpeningBrace = false;
        testHasAssertion = false;
        testWasSkipped = false;
      }
    }

    if (GO_SKIP_RE.test(masked)) {
      skippedCount += 1;
      testWasSkipped = true;
      if (shouldReport(lineNum, activeRanges)) {
        findings.push({
          ruleId: 'skipped-test',
          severity: 'warning',
          file: filePath,
          line: lineNum,
          column: 1,
          message: `Skipped Go test (${raw.trim()}) hides unverified behavior.`,
          snippet: raw.trim(),
        });
      }
    }

    if (GO_ASSERTION_RE.test(masked)) {
      assertionCount += 1;
      testHasAssertion = true;
      if (GO_VACUOUS_RE.test(raw) && !testWasSkipped && shouldReport(lineNum, activeRanges)) {
        findings.push({
          ruleId: 'vacuous-assertion',
          severity: 'error',
          file: filePath,
          line: lineNum,
          column: 1,
          message: `Vacuous Go assertion (${raw.trim()}) always evaluates statically.`,
          snippet: raw.trim(),
        });
      }
    }

    if (activeTestName !== null) {
      for (const ch of masked) {
        if (ch === '{') {
          braceDepth += 1;
          seenOpeningBrace = true;
        } else if (ch === '}') {
          braceDepth -= 1;
        }
      }
      if (seenOpeningBrace && braceDepth <= 0) {
        if (!testHasAssertion && !testWasSkipped && shouldReport(activeTestLine, activeRanges)) {
          findings.push({
            ruleId: 'empty-test',
            severity: 'error',
            file: filePath,
            line: activeTestLine,
            column: 1,
            message: `Go test '${activeTestName}' has no error/fatal/assert calls.`,
            snippet: (rawLines[activeTestLine - 1] ?? '').trim(),
          });
        }
        activeTestName = null;
      }
    }
  }

  return {
    file: filePath,
    testCount,
    assertionCount,
    mockCount: 0,
    skippedCount,
  };
}
