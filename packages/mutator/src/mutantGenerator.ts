import fs from 'node:fs';
import ts from 'typescript';
import {
  isLineInRanges,
  isSupportedSourceFile,
  isTestFile,
  resolveContainedPath,
  type FileDiff,
  type LineRange,
} from '@specproof/core';
import { collectGoMutants } from './goMutator.js';
import { collectPythonMutants } from './pythonMutator.js';

export interface CandidateMutant {
  id: string;
  file: string;
  line: number;
  column: number;
  operator: string;
  start: number;
  end: number;
  original: string;
  mutated: string;
}

const BINARY_MUTATIONS: ReadonlyMap<ts.SyntaxKind, { op: string; replacement: string }> = new Map([
  [ts.SyntaxKind.EqualsEqualsEqualsToken, { op: 'equality', replacement: '!==' }],
  [ts.SyntaxKind.ExclamationEqualsEqualsToken, { op: 'equality', replacement: '===' }],
  [ts.SyntaxKind.EqualsEqualsToken, { op: 'equality', replacement: '!=' }],
  [ts.SyntaxKind.ExclamationEqualsToken, { op: 'equality', replacement: '==' }],
  [ts.SyntaxKind.GreaterThanToken, { op: 'boundary', replacement: '>=' }],
  [ts.SyntaxKind.GreaterThanEqualsToken, { op: 'boundary', replacement: '>' }],
  [ts.SyntaxKind.LessThanToken, { op: 'boundary', replacement: '<=' }],
  [ts.SyntaxKind.LessThanEqualsToken, { op: 'boundary', replacement: '<' }],
  [ts.SyntaxKind.AmpersandAmpersandToken, { op: 'logical', replacement: '||' }],
  [ts.SyntaxKind.BarBarToken, { op: 'logical', replacement: '&&' }],
  [ts.SyntaxKind.PlusToken, { op: 'arithmetic', replacement: ' - ' }],
  [ts.SyntaxKind.MinusToken, { op: 'arithmetic', replacement: ' + ' }],
]);

function containsStringLikeExpression(node: ts.Expression): boolean {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node)
  ) {
    return true;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return containsStringLikeExpression(node.left) || containsStringLikeExpression(node.right);
  }
  return false;
}

/**
 * Generates AST-based micro-mutants strictly scoped to changed line ranges in production files.
 */
export function generateDiffMutants(
  repoRoot: string,
  diffFiles: FileDiff[],
  maxMutants: number,
  includeAllLines = false,
): CandidateMutant[] {
  const mutants: CandidateMutant[] = [];

  for (const fileDiff of diffFiles) {
    if (mutants.length >= maxMutants) {
      break;
    }

    const relPath = fileDiff.path.replace(/\\/g, '/');
    if (!isSupportedSourceFile(relPath) || isTestFile(relPath)) {
      continue;
    }

    let fullPath: string;
    try {
      fullPath = resolveContainedPath(repoRoot, relPath);
    } catch {
      continue;
    }
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      continue;
    }

    const sourceText = fs.readFileSync(fullPath, 'utf8');
    const activeRanges = includeAllLines ? undefined : fileDiff.addedRanges;
    if (activeRanges !== undefined && activeRanges.length === 0) {
      continue;
    }

    if (relPath.endsWith('.go')) {
      collectGoMutants(sourceText, relPath, activeRanges, mutants, maxMutants);
      continue;
    }

    if (relPath.endsWith('.py')) {
      collectPythonMutants(sourceText, relPath, activeRanges, mutants, maxMutants);
      continue;
    }

    const sourceFile = ts.createSourceFile(relPath, sourceText, ts.ScriptTarget.Latest, true);
    collectFileMutants(sourceFile, relPath, activeRanges, mutants, maxMutants);
  }

  return mutants;
}

function collectFileMutants(
  sourceFile: ts.SourceFile,
  filePath: string,
  activeRanges: LineRange[] | undefined,
  out: CandidateMutant[],
  maxMutants: number,
): void {
  function pushMutant(
    node: ts.Node,
    operator: string,
    replacement: string,
  ): void {
    if (out.length >= maxMutants) {
      return;
    }
    const start = node.getStart(sourceFile);
    const end = node.getEnd();
    const lc = sourceFile.getLineAndCharacterOfPosition(start);
    const line = lc.line + 1;
    if (activeRanges !== undefined && (activeRanges.length === 0 || !isLineInRanges(line, activeRanges))) {
      return;
    }

    const original = node.getText(sourceFile);
    if (original === replacement.trim()) {
      return;
    }

    out.push({
      id: `M${out.length + 1}`,
      file: filePath,
      line,
      column: lc.character + 1,
      operator,
      start,
      end,
      original,
      mutated: replacement,
    });
  }

  function visit(node: ts.Node): void {
    if (out.length >= maxMutants) {
      return;
    }

    if (ts.isBinaryExpression(node)) {
      const mapping = BINARY_MUTATIONS.get(node.operatorToken.kind);
      if (
        mapping &&
        !(
          node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
          (containsStringLikeExpression(node.left) || containsStringLikeExpression(node.right))
        )
      ) {
        pushMutant(node.operatorToken, mapping.op, mapping.replacement);
      }
    } else if (node.kind === ts.SyntaxKind.TrueKeyword) {
      pushMutant(node, 'boolean', 'false');
    } else if (node.kind === ts.SyntaxKind.FalseKeyword) {
      pushMutant(node, 'boolean', 'true');
    } else if (
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.ExclamationToken
    ) {
      pushMutant(node, 'negation', `(${node.operand.getText(sourceFile)})`);
    } else if (ts.isIfStatement(node)) {
      pushMutant(node.expression, 'branch', 'false');
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

export function applyMutantToSource(sourceText: string, mutant: CandidateMutant): string {
  return (
    sourceText.slice(0, mutant.start) +
    mutant.mutated +
    sourceText.slice(mutant.end)
  );
}
