import { isLineInRanges } from '../diff/gitDiff.js';
import { maskPythonStringsAndComments } from '../python/masker.js';
import type {
  FileTestMetrics,
  IntegrityFinding,
  LineRange,
  SpecProofConfig,
} from '../types.js';

const PY_SKIP_DECORATOR_RE = /^\s*@(?:pytest\.mark\.(?:skip|skipif)|unittest\.skip(?:If|Unless)?)\b/;
const PY_TEST_DEF_RE = /^(\s*)(?:async\s+)?def\s+(test_[a-zA-Z0-9_]*)\s*\(/;
const PY_ANY_DEF_OR_CLASS_RE = /^(\s*)(?:(?:async\s+)?def|class)\s+[a-zA-Z_][a-zA-Z0-9_]*/;
const PY_EXCEPT_RE = /^(\s*)except\b(.*)$/;
const PY_EMPTY_OR_LOG_STMT_RE =
  /^\s*(?:pass|\.\.\.|print\(|logging\.\w+\(|logger\.\w+\().*$/;
const PY_ASSERTION_RE =
  /\b(?:assert\b|self\.assert\w+\(|pytest\.raises\()/;
const PY_VACUOUS_ASSERT_RE =
  /^\s*(?:assert\s+(?:True|False)\s*(?:,.*)?$|assert\s+(-?\d+|"[^"]*"|'[^']*')\s*==\s*\1\s*(?:,.*)?$|self\.assertTrue\(\s*True\s*\)|self\.assertFalse\(\s*False\s*\)|self\.assertEqual\(\s*(-?\d+|"[^"]*"|'[^']*')\s*,\s*\2\s*\))/;
const PY_MOCK_RE =
  /(?:@patch\b|\b(?:mock\.patch|unittest\.mock\.patch|MagicMock|AsyncMock|mocker\.patch)\b)/g;

function shouldReport(line: number, activeRanges?: LineRange[]): boolean {
  if (activeRanges === undefined) {
    return true;
  }
  if (activeRanges.length === 0) {
    return false;
  }
  return isLineInRanges(line, activeRanges);
}

function getIndentWidth(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === ' ') {
      count += 1;
    } else if (ch === '\t') {
      count += 4;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Finds the end line index of a possibly multi-line Python header ending with `:`.
 */
function findHeaderEndIndex(maskedLines: string[], startIndex: number): { endIdx: number; inlineBody: string } {
  let depth = 0;
  for (let i = startIndex; i < maskedLines.length; i += 1) {
    const line = maskedLines[i] ?? '';
    for (let c = 0; c < line.length; c += 1) {
      const ch = line[c];
      if (ch === '(' || ch === '[' || ch === '{') {
        depth += 1;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth = Math.max(0, depth - 1);
      } else if (ch === ':' && depth === 0) {
        return { endIdx: i, inlineBody: line.slice(c + 1).trim() };
      }
    }
  }
  return { endIdx: startIndex, inlineBody: '' };
}

function collectPythonBlock(
  maskedLines: string[],
  rawLines: string[],
  headerStartIdx: number,
  headerIndent: number,
): { rawBody: string[]; maskedBody: string[] } {
  const { endIdx, inlineBody } = findHeaderEndIndex(maskedLines, headerStartIdx);
  if (inlineBody.length > 0) {
    const rawHeader = rawLines[endIdx] ?? '';
    const colonPos = (maskedLines[endIdx] ?? '').lastIndexOf(':');
    return {
      rawBody: [colonPos >= 0 ? rawHeader.slice(colonPos + 1).trim() : inlineBody],
      maskedBody: [inlineBody],
    };
  }

  const rawBody: string[] = [];
  const maskedBody: string[] = [];
  for (let i = endIdx + 1; i < maskedLines.length; i += 1) {
    const masked = maskedLines[i] ?? '';
    const trimmed = masked.trim();
    if (!trimmed) {
      continue;
    }
    if (getIndentWidth(masked) <= headerIndent) {
      break;
    }
    rawBody.push(rawLines[i] ?? '');
    maskedBody.push(masked);
  }
  return { rawBody, maskedBody };
}

/**
 * Analyzes a Python test file for skipped tests, empty tests, vacuous assertions, and mock abuse.
 */
export function analyzePythonTestFile(
  content: string,
  filePath: string,
  config: SpecProofConfig,
  findings: IntegrityFinding[],
  activeRanges?: LineRange[],
): FileTestMetrics {
  const rawLines = content.split(/\r?\n/);
  const maskedLines = maskPythonStringsAndComments(content).split(/\r?\n/);
  let testCount = 0;
  let assertionCount = 0;
  let effectiveAssertionCount = 0;
  let mockCount = 0;
  let skippedCount = 0;

  let pendingSkipIndent: number | null = null;
  let activeSkipBlockIndent: number | null = null;

  for (let idx = 0; idx < rawLines.length; idx += 1) {
    const raw = rawLines[idx] ?? '';
    const masked = maskedLines[idx] ?? '';
    const lineNum = idx + 1;
    const trimmedMasked = masked.trim();

    if (!trimmedMasked) {
      continue;
    }

    const indent = getIndentWidth(masked);
    if (activeSkipBlockIndent !== null && indent <= activeSkipBlockIndent && !trimmedMasked.startsWith('@')) {
      activeSkipBlockIndent = null;
    }

    if (PY_SKIP_DECORATOR_RE.test(masked)) {
      skippedCount += 1;
      pendingSkipIndent = indent;
      if (shouldReport(lineNum, activeRanges)) {
        findings.push({
          ruleId: 'skipped-test',
          severity: 'warning',
          file: filePath,
          line: lineNum,
          column: indent + 1,
          message: `Skipped Python test decorator (${raw.trim()}) hides unverified behavior.`,
          snippet: raw.trim(),
        });
      }
      continue;
    }

    const testMatch = PY_TEST_DEF_RE.exec(masked);
    if (testMatch) {
      testCount += 1;
      const defIndent = getIndentWidth(testMatch[1] ?? '');
      if (pendingSkipIndent !== null && defIndent >= pendingSkipIndent) {
        activeSkipBlockIndent = defIndent;
      }
      pendingSkipIndent = null;

      const { maskedBody } = collectPythonBlock(maskedLines, rawLines, idx, defIndent);
      const hasAssertion = maskedBody.some((stmt) => PY_ASSERTION_RE.test(stmt));
      if (!hasAssertion && shouldReport(lineNum, activeRanges)) {
        findings.push({
          ruleId: 'empty-test',
          severity: 'error',
          file: filePath,
          line: lineNum,
          column: defIndent + 1,
          message: `Python test '${testMatch[2]}' has no assertions (assert/pytest.raises).`,
          snippet: raw.trim(),
        });
      }
    } else if (PY_ANY_DEF_OR_CLASS_RE.test(masked)) {
      if (pendingSkipIndent !== null && /^(\s*)class\s+/.test(masked)) {
        activeSkipBlockIndent = indent;
      }
      pendingSkipIndent = null;
    }

    if (!trimmedMasked.startsWith('import ') && !trimmedMasked.startsWith('from ')) {
      const mockMatches = masked.match(PY_MOCK_RE);
      if (mockMatches) {
        mockCount += mockMatches.length;
      }
    }

    if (PY_ASSERTION_RE.test(masked)) {
      assertionCount += 1;
      if (PY_VACUOUS_ASSERT_RE.test(raw)) {
        if (shouldReport(lineNum, activeRanges)) {
          findings.push({
            ruleId: 'vacuous-assertion',
            severity: 'error',
            file: filePath,
            line: lineNum,
            column: indent + 1,
            message: `Vacuous Python assertion (${raw.trim()}) always evaluates statically.`,
            snippet: raw.trim(),
          });
        }
      } else if (activeSkipBlockIndent === null) {
        effectiveAssertionCount += 1;
      }
    }
  }

  if (mockCount >= config.minMocksBeforeFlagging) {
    const ratio = effectiveAssertionCount === 0 ? Infinity : mockCount / effectiveAssertionCount;
    if (ratio > config.mockToAssertionMaxRatio) {
      findings.push({
        ruleId: 'mock-abuse',
        severity: 'warning',
        file: filePath,
        line: 1,
        column: 1,
        message: `High mock-to-assertion ratio (${mockCount} mocks vs ${effectiveAssertionCount} effective assertions). Tests may only verify mocked stubs.`,
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

/**
 * Analyzes a Python production file for swallowed exceptions (`except: pass` or log-only handlers).
 */
export function analyzePythonSourceFile(
  content: string,
  filePath: string,
  findings: IntegrityFinding[],
  activeRanges?: LineRange[],
): void {
  const rawLines = content.split(/\r?\n/);
  const maskedLines = maskPythonStringsAndComments(content).split(/\r?\n/);

  for (let idx = 0; idx < maskedLines.length; idx += 1) {
    const masked = maskedLines[idx] ?? '';
    const match = PY_EXCEPT_RE.exec(masked);
    if (!match) {
      continue;
    }

    const lineNum = idx + 1;
    const indent = getIndentWidth(match[1] ?? '');
    const { maskedBody } = collectPythonBlock(maskedLines, rawLines, idx, indent);
    const swallowed =
      maskedBody.length === 0 ||
      maskedBody.every((stmt) => PY_EMPTY_OR_LOG_STMT_RE.test(stmt));

    if (swallowed && shouldReport(lineNum, activeRanges)) {
      findings.push({
        ruleId: 'swallowed-error',
        severity: 'warning',
        file: filePath,
        line: lineNum,
        column: indent + 1,
        message: 'Swallowed Python exception in except block (pass or logging-only without recovery/raise).',
        snippet: (rawLines[idx] ?? '').trim(),
      });
    }
  }
}
