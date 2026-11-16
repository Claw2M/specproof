import {
  isLineInRanges,
  maskGoStringsAndComments,
  type LineRange,
} from '@specproof/core';
import type { CandidateMutant } from './mutantGenerator.js';

interface GoRule {
  operator: string;
  regex: RegExp;
  replacement: string;
}

const GO_MUTATION_RULES: GoRule[] = [
  { operator: 'equality', regex: /==/g, replacement: '!=' },
  { operator: 'equality', regex: /!=/g, replacement: '==' },
  { operator: 'boundary', regex: />=/g, replacement: '>' },
  { operator: 'boundary', regex: /<=/g, replacement: '<' },
  { operator: 'boundary', regex: /(?<![<>!=:-])>(?![>=])/g, replacement: '>=' },
  { operator: 'boundary', regex: /(?<![<>!=:-])<(?![<=])/g, replacement: '<=' },
  { operator: 'logical', regex: /&&/g, replacement: '||' },
  { operator: 'logical', regex: /\|\|/g, replacement: '&&' },
  { operator: 'boolean', regex: /\btrue\b/g, replacement: 'false' },
  { operator: 'boolean', regex: /\bfalse\b/g, replacement: 'true' },
];

/**
 * Generates diff-scoped micro-mutants for a Go source file.
 */
export function collectGoMutants(
  sourceText: string,
  filePath: string,
  activeRanges: LineRange[] | undefined,
  out: CandidateMutant[],
  maxMutants: number,
): void {
  if (activeRanges !== undefined && activeRanges.length === 0) {
    return;
  }

  const masked = maskGoStringsAndComments(sourceText);
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
    if (
      !trimmed ||
      trimmed.startsWith('package ') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('func ') ||
      trimmed.startsWith('type ')
    ) {
      continue;
    }

    const seenLineOffsets = new Set<number>();
    for (const rule of GO_MUTATION_RULES) {
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
