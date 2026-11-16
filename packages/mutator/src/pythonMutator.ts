import {
  isLineInRanges,
  maskPythonStringsAndComments,
  type LineRange,
} from '@specproof/core';
import type { CandidateMutant } from './mutantGenerator.js';

interface PyRule {
  operator: string;
  regex: RegExp;
  replacement: string;
}

const PY_MUTATION_RULES: PyRule[] = [
  { operator: 'equality', regex: /==/g, replacement: '!=' },
  { operator: 'equality', regex: /!=/g, replacement: '==' },
  { operator: 'boundary', regex: />=/g, replacement: '>' },
  { operator: 'boundary', regex: /<=/g, replacement: '<' },
  { operator: 'boundary', regex: /(?<![<>!=-])>(?![>=])/g, replacement: '>=' },
  { operator: 'boundary', regex: /(?<![<>!=])<(?![<=])/g, replacement: '<=' },
  { operator: 'logical', regex: /\band\b/g, replacement: 'or' },
  { operator: 'logical', regex: /\bor\b/g, replacement: 'and' },
  { operator: 'boolean', regex: /\bTrue\b/g, replacement: 'False' },
  { operator: 'boolean', regex: /\bFalse\b/g, replacement: 'True' },
];

function isSignatureOrImportLine(trimmed: string): boolean {
  return (
    trimmed.startsWith('def ') ||
    trimmed.startsWith('async def ') ||
    trimmed.startsWith('class ') ||
    trimmed.startsWith('import ') ||
    trimmed.startsWith('from ') ||
    trimmed.startsWith('@') ||
    /^\)\s*(?:->\s*.+)?:\s*$/.test(trimmed)
  );
}

/**
 * Generates diff-scoped micro-mutants for a Python source file.
 */
export function collectPythonMutants(
  sourceText: string,
  filePath: string,
  activeRanges: LineRange[] | undefined,
  out: CandidateMutant[],
  maxMutants: number,
): void {
  if (activeRanges !== undefined && activeRanges.length === 0) {
    return;
  }

  const masked = maskPythonStringsAndComments(sourceText);
  const rawLines = sourceText.split('\n');
  const maskedLines = masked.split('\n');

  let offset = 0;
  for (let idx = 0; idx < rawLines.length; idx += 1) {
    if (out.length >= maxMutants) {
      break;
    }

    const lineNum = idx + 1;
    const rawLine = rawLines[idx] ?? '';
    const maskedLine = maskedLines[idx] ?? '';
    const lineStart = offset;
    offset += rawLine.length + 1;

    if (activeRanges !== undefined && !isLineInRanges(lineNum, activeRanges)) {
      continue;
    }

    const trimmed = maskedLine.trim();
    if (!trimmed || isSignatureOrImportLine(trimmed)) {
      continue;
    }

    const seenLineOffsets = new Set<number>();
    for (const rule of PY_MUTATION_RULES) {
      if (out.length >= maxMutants) {
        break;
      }
      rule.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.regex.exec(maskedLine)) !== null) {
        if (out.length >= maxMutants) {
          break;
        }
        const colOffset = match.index;
        if (seenLineOffsets.has(colOffset)) {
          continue;
        }
        seenLineOffsets.add(colOffset);
        const original = match[0];
        out.push({
          id: `M${out.length + 1}`,
          file: filePath,
          line: lineNum,
          column: colOffset + 1,
          operator: rule.operator,
          start: lineStart + colOffset,
          end: lineStart + colOffset + original.length,
          original,
          mutated: rule.replacement,
        });
      }
    }
  }
}
