export type Severity = 'error' | 'warning' | 'info';

export type IntegrityRuleId =
  | 'vacuous-assertion'
  | 'empty-test'
  | 'skipped-test'
  | 'mock-abuse'
  | 'swallowed-error';

export interface LineRange {
  start: number;
  end: number;
}

export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  addedRanges: LineRange[];
  addedLines: string[];
}

export interface IntegrityFinding {
  ruleId: IntegrityRuleId;
  severity: Severity;
  file: string;
  line: number;
  column: number;
  message: string;
  snippet?: string;
}

export interface FileTestMetrics {
  file: string;
  testCount: number;
  assertionCount: number;
  mockCount: number;
  skippedCount: number;
}

export interface IntegritySummary {
  filesScanned: number;
  testFilesScanned: number;
  totalTests: number;
  totalAssertions: number;
  totalMocks: number;
  findings: IntegrityFinding[];
  fileMetrics: FileTestMetrics[];
}

export interface MutantResult {
  id: string;
  file: string;
  line: number;
  column: number;
  operator: string;
  original: string;
  mutated: string;
  status: 'killed' | 'survived' | 'timeout' | 'error';
  durationMs: number;
}

export interface MutationSummary {
  totalMutants: number;
  killed: number;
  survived: number;
  timeouts: number;
  errors: number;
  score: number;
  durationMs: number;
  results: MutantResult[];
}

export type LlmProvider = 'openai' | 'anthropic' | 'gemini';

export interface SpecRequirement {
  id: string;
  text: string;
  keywords: string[];
  covered: boolean;
  matchedFiles: string[];
  matchedSymbols: string[];
  llmVerdict?: 'covered' | 'partial' | 'missing';
  llmReason?: string;
}

export interface SpecCoverageSummary {
  specPath?: string;
  totalRequirements: number;
  coveredCount: number;
  coverageRatio: number;
  evaluatedBy?: 'deterministic' | LlmProvider;
  requirements: SpecRequirement[];
}

export interface SpecProofConfig {
  testCommand: string;
  maxMutantsPerRun: number;
  mutationTimeoutMs: number;
  failUnderMutationScore: number;
  mockToAssertionMaxRatio: number;
  minMocksBeforeFlagging: number;
  blockOnMockAbuse: boolean;
  blockOnVacuous: boolean;
  requireSpecMatch: boolean;
  specFile?: string;
  llmProvider?: LlmProvider;
  llmModel?: string;
  ignorePatterns: string[];
}

export interface VerificationReport {
  timestamp: string;
  repoRoot: string;
  baseRef?: string;
  diffFiles: FileDiff[];
  integrity: IntegritySummary;
  mutation?: MutationSummary;
  specCoverage?: SpecCoverageSummary;
  passed: boolean;
  failureReasons: string[];
}
