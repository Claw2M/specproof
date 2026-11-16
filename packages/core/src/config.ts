import fs from 'node:fs';
import path from 'node:path';
import type { SpecProofConfig } from './types.js';

export const DEFAULT_CONFIG: SpecProofConfig = {
  testCommand: 'npm test',
  maxMutantsPerRun: 25,
  mutationTimeoutMs: 15_000,
  failUnderMutationScore: 70,
  mockToAssertionMaxRatio: 2.5,
  minMocksBeforeFlagging: 3,
  blockOnMockAbuse: false,
  blockOnVacuous: true,
  requireSpecMatch: false,
  ignorePatterns: [
    'node_modules',
    'dist',
    'coverage',
    '.specproof-tmp',
    '.specproof-cloud',
    '.venv',
    'venv',
    '__pycache__',
    '.pytest_cache',
    'target',
    '.next',
  ],
};

/**
 * Loads `.specproof.json` (or a custom config path) and validates numeric/boolean bounds.
 */
export function loadConfig(repoRoot: string, customConfigPath?: string): SpecProofConfig {
  const configPath = customConfigPath
    ? path.resolve(repoRoot, customConfigPath)
    : path.join(repoRoot, '.specproof.json');

  if (!fs.existsSync(configPath)) {
    if (customConfigPath) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    return { ...DEFAULT_CONFIG, ignorePatterns: [...DEFAULT_CONFIG.ignorePatterns] };
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<SpecProofConfig>;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid config object in ${configPath}`);
  }

  const merged: SpecProofConfig = {
    ...DEFAULT_CONFIG,
    ...parsed,
    ignorePatterns: Array.isArray(parsed.ignorePatterns)
      ? parsed.ignorePatterns.filter((p): p is string => typeof p === 'string')
      : [...DEFAULT_CONFIG.ignorePatterns],
  };

  if (!Number.isFinite(merged.maxMutantsPerRun) || merged.maxMutantsPerRun < 1) {
    throw new Error('Config maxMutantsPerRun must be >= 1.');
  }
  if (!Number.isFinite(merged.mutationTimeoutMs) || merged.mutationTimeoutMs <= 0) {
    throw new Error('Config mutationTimeoutMs must be > 0.');
  }
  if (
    !Number.isFinite(merged.failUnderMutationScore) ||
    merged.failUnderMutationScore < 0 ||
    merged.failUnderMutationScore > 100
  ) {
    throw new Error('Config failUnderMutationScore must be between 0 and 100.');
  }

  return merged;
}
