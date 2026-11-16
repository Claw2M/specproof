import fs from 'node:fs';
import path from 'node:path';
import { isSupportedSourceFile } from '../analyzer/testIntegrity.js';
import { isSymlinkEscapingRoot } from '../security/pathSafety.js';

function compileIgnoreMatcher(patterns: string[]): (relPath: string, entryName: string) => boolean {
  const exactSegments = new Set<string>(['.git', '.specproof-tmp']);
  const regexes: RegExp[] = [];

  for (const raw of patterns) {
    const clean = raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!clean) {
      continue;
    }
    if (!clean.includes('*') && !clean.includes('/')) {
      exactSegments.add(clean);
    } else {
      const escaped = clean
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*');
      regexes.push(new RegExp(`^${escaped}(?:/.*)?$`));
    }
  }

  return (relPath: string, entryName: string) => {
    if (exactSegments.has(entryName)) {
      return true;
    }
    const normalized = relPath.replace(/\\/g, '/');
    return regexes.some((re) => re.test(normalized));
  };
}

/**
 * Recursively collects supported TypeScript/JavaScript/Python source files while
 * skipping ignored paths and symlinks escaping `repoRoot`.
 */
export function collectProjectFiles(
  repoRoot: string,
  ignorePatterns: string[],
): string[] {
  if (!fs.existsSync(repoRoot)) {
    return [];
  }

  const realRoot = fs.realpathSync(repoRoot);
  const isIgnored = compileIgnoreMatcher(ignorePatterns);
  const results: string[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') {
        return;
      }
      throw err;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(realRoot, fullPath).replace(/\\/g, '/');
      if (isIgnored(relPath, entry.name) || isSymlinkEscapingRoot(realRoot, fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && isSupportedSourceFile(entry.name)) {
        results.push(relPath);
      }
    }
  }

  walk(realRoot);
  return results;
}
