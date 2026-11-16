import fs from 'node:fs';
import ts from 'typescript';
import { resolveContainedPath } from '../security/pathSafety.js';
import type { FileDiff, SpecCoverageSummary, SpecRequirement } from '../types.js';

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'when',
  'then',
  'should',
  'must',
  'have',
  'will',
  'able',
  'only',
  'also',
  'not',
  'are',
  'was',
  'were',
  'been',
  'each',
  'every',
  'user',
  'system',
]);

const CHECKBOX_RE = /^\s*(?:[-*]|\d+\.)\s+\[[ xX]\]\s+(?:(?:AC|REQ)[-\s]*\d*\s*:\s*)?(.+)$/;
const EXPLICIT_REQ_RE = /^\s*(?:[-*]\s+)?(?:AC|REQ)[-\s]*\d*\s*:\s*(.+)$/i;

/**
 * Extracts acceptance criteria / requirements from a SPEC.md or PR description,
 * ignoring fenced code blocks.
 */
export function parseRequirementsFromMarkdown(markdown: string): Array<{ id: string; text: string; keywords: string[] }> {
  const results: Array<{ id: string; text: string; keywords: string[] }> = [];
  let index = 1;
  let inFence = false;

  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const checkbox = CHECKBOX_RE.exec(trimmed);
    const explicit = EXPLICIT_REQ_RE.exec(trimmed);
    const rawText = checkbox?.[1] ?? explicit?.[1];
    if (!rawText) {
      continue;
    }

    const cleanText = rawText.replace(/`/g, '').trim();
    if (cleanText.length < 4) {
      continue;
    }

    results.push({
      id: `REQ-${index}`,
      text: cleanText,
      keywords: extractKeywords(cleanText),
    });
    index += 1;
  }

  return results;
}

function extractKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  return [...new Set(tokens)];
}

/**
 * Collects exported, class method, and top-level symbol names from TS/JS/Python files.
 */
export function extractFileSymbols(repoRoot: string, relPath: string): string[] {
  let fullPath: string;
  try {
    fullPath = resolveContainedPath(repoRoot, relPath);
  } catch {
    return [];
  }
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    return [];
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  if (relPath.endsWith('.go')) {
    const goSymbols: string[] = [];
    for (const line of content.split(/\r?\n/)) {
      const fnMatch = /^\s*func\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
      if (fnMatch?.[1]) {
        goSymbols.push(fnMatch[1]);
      }
      const typeMatch = /^\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\s+/.exec(line);
      if (typeMatch?.[1]) {
        goSymbols.push(typeMatch[1]);
      }
    }
    return goSymbols;
  }

  if (relPath.endsWith('.py')) {
    const pySymbols: string[] = [];
    for (const line of content.split(/\r?\n/)) {
      const match = /^\s*(?:async\s+)?(?:def|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/.exec(line);
      if (match?.[1]) {
        pySymbols.push(match[1]);
      }
    }
    return pySymbols;
  }

  const sourceFile = ts.createSourceFile(relPath, content, ts.ScriptTarget.Latest, true);
  const symbols: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node)) &&
      node.name
    ) {
      symbols.push(node.name.text);
    } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      symbols.push(node.name.text);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      symbols.push(node.name.text);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const fn = node.expression.text;
      if ((fn === 'it' || fn === 'test' || fn === 'describe') && node.arguments[0]) {
        if (ts.isStringLiteral(node.arguments[0])) {
          symbols.push(node.arguments[0].text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return symbols;
}

function matchesKeyword(searchable: string, tokens: Set<string>, kw: string): boolean {
  if (kw.length <= 4) {
    return tokens.has(kw);
  }
  return searchable.includes(kw);
}

/**
 * Maps markdown requirements against changed files, symbols, and added lines.
 */
export function evaluateSpecCoverage(
  repoRoot: string,
  specMarkdown: string,
  diffFiles: FileDiff[],
  specPath?: string,
): SpecCoverageSummary {
  const parsed = parseRequirementsFromMarkdown(specMarkdown);

  const fileIndex = diffFiles.map((file) => {
    const symbols = extractFileSymbols(repoRoot, file.path);
    const searchable = [
      file.path.toLowerCase(),
      ...symbols.map((s) => s.toLowerCase()),
      ...file.addedLines.map((l) => l.toLowerCase()),
    ].join(' ');
    const tokens = new Set(searchable.split(/[^a-z0-9_]+/).filter(Boolean));
    return { path: file.path, symbols, searchable, tokens };
  });

  const requirements: SpecRequirement[] = parsed.map((req) => {
    const matchedFiles: string[] = [];
    const matchedSymbols: string[] = [];
    const matchedAcrossDiff = new Set<string>();

    for (const file of fileIndex) {
      const matchedKeywords = req.keywords.filter((kw) =>
        matchesKeyword(file.searchable, file.tokens, kw),
      );
      if (matchedKeywords.length > 0) {
        matchedFiles.push(file.path);
        for (const kw of matchedKeywords) {
          matchedAcrossDiff.add(kw);
        }
        for (const sym of file.symbols) {
          const lowerSym = sym.toLowerCase();
          if (req.keywords.some((kw) => lowerSym.includes(kw))) {
            matchedSymbols.push(sym);
          }
        }
      }
    }

    const minKeywordsRequired = req.keywords.length <= 2 ? req.keywords.length : 2;
    const covered =
      matchedSymbols.length > 0 ||
      (matchedAcrossDiff.size >= minKeywordsRequired && matchedAcrossDiff.size > 0);
    return {
      id: req.id,
      text: req.text,
      keywords: req.keywords,
      covered,
      matchedFiles: [...new Set(matchedFiles)],
      matchedSymbols: [...new Set(matchedSymbols)],
    };
  });

  const coveredCount = requirements.filter((r) => r.covered).length;
  const totalRequirements = requirements.length;
  const coverageRatio = totalRequirements === 0 ? 1 : coveredCount / totalRequirements;

  return {
    specPath,
    totalRequirements,
    coveredCount,
    coverageRatio,
    evaluatedBy: 'deterministic',
    requirements,
  };
}
