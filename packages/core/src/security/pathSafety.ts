import fs from 'node:fs';
import path from 'node:path';

const REPO_SLUG_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * Resolves a relative path safely within `rootDir`, blocking absolute paths,
 * NUL bytes, `..` traversal, and symlinks that escape `rootDir`.
 */
export function resolveContainedPath(rootDir: string, targetPath: string): string {
  if (!targetPath || targetPath.includes('\0')) {
    throw new Error(`Invalid path: ${targetPath}`);
  }
  if (path.isAbsolute(targetPath)) {
    throw new Error(`Path must be relative to repository root: ${targetPath}`);
  }

  const realRoot = fs.existsSync(rootDir) ? fs.realpathSync(rootDir) : path.resolve(rootDir);
  const candidate = path.resolve(realRoot, targetPath);
  const relCandidate = path.relative(realRoot, candidate);

  if (relCandidate.startsWith('..') || path.isAbsolute(relCandidate)) {
    throw new Error(`Path escapes repository root: ${targetPath}`);
  }

  if (fs.existsSync(candidate)) {
    const realTarget = fs.realpathSync(candidate);
    const relReal = path.relative(realRoot, realTarget);
    if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
      throw new Error(`Symlink escapes repository root: ${targetPath}`);
    }
    return realTarget;
  }

  return candidate;
}

/**
 * Returns true if `targetPath` is a symlink whose real target escapes `rootDir`.
 */
export function isSymlinkEscapingRoot(rootDir: string, targetPath: string): boolean {
  try {
    const stat = fs.lstatSync(targetPath);
    if (!stat.isSymbolicLink()) {
      return false;
    }
    const realRoot = fs.realpathSync(rootDir);
    const realTarget = fs.realpathSync(targetPath);
    const rel = path.relative(realRoot, realTarget);
    return rel.startsWith('..') || path.isAbsolute(rel);
  } catch {
    return true;
  }
}

export function validateRepoSlug(repoSlug: string): string {
  const trimmed = repoSlug.trim();
  if (!REPO_SLUG_RE.test(trimmed) || trimmed.includes('..')) {
    throw new Error(`Invalid repository slug "${repoSlug}". Expected "owner/repo".`);
  }
  const [owner, repo] = trimmed.split('/');
  if (!owner || !repo || owner === '.' || repo === '.') {
    throw new Error(`Invalid repository slug "${repoSlug}". Expected "owner/repo".`);
  }
  return trimmed;
}

export function validateHttpUrl(rawUrl: string, requireHttpsNonLocal = false): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol "${parsed.protocol}" for ${rawUrl}`);
  }
  const isLocal =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1';
  if (requireHttpsNonLocal && !isLocal && parsed.protocol !== 'https:') {
    throw new Error(`Non-local URL must use HTTPS when transmitting credentials: ${rawUrl}`);
  }
  return parsed;
}
