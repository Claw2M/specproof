import type { CloudStore } from './store.js';

/**
 * Populates realistic TypeScript and Python PR verification runs and synced specs for local demos.
 */
export function seedDemoData(store: CloudStore): { runsCreated: number; specsCreated: number } {
  const now = Date.now();

  store.upsertSpec({
    externalId: 'LIN-412',
    source: 'linear',
    repoSlug: 'acme/billing-api',
    title: 'Enforce idempotency & annual discount boundaries',
    checklistMarkdown: [
      '- [ ] Reject expired webhook signatures before processing payment',
      '- [ ] Apply annual discount only when seatCount >= 5',
      '- [ ] Persist idempotency key on retryable charges',
    ].join('\n'),
  });

  store.upsertSpec({
    externalId: 'JIRA-89',
    source: 'jira',
    repoSlug: 'acme/ml-worker',
    title: 'Guard FastAPI batch inference retries',
    checklistMarkdown: [
      '- [ ] Propagate InferenceTimeoutError instead of swallowing exceptions',
      '- [ ] Cap batch size at 64 items per worker call',
    ].join('\n'),
  });

  store.insertRun({
    repoSlug: 'acme/billing-api',
    branch: 'ai/cursor-discount-refactor',
    prNumber: 148,
    report: {
      timestamp: new Date(now - 1000 * 60 * 18).toISOString(),
      repoRoot: '/repos/acme/billing-api',
      baseRef: 'main',
      diffFiles: [
        {
          path: 'src/pricing/discount.ts',
          status: 'modified',
          addedRanges: [{ start: 14, end: 29 }],
          addedLines: ['if (seats >= 5) return total * 0.85;'],
        },
        {
          path: 'src/pricing/discount.test.ts',
          status: 'added',
          addedRanges: [{ start: 1, end: 24 }],
          addedLines: ['expect(true).toBe(true);'],
        },
      ],
      integrity: {
        filesScanned: 2,
        testFilesScanned: 1,
        totalTests: 3,
        totalAssertions: 2,
        totalMocks: 4,
        findings: [
          {
            ruleId: 'vacuous-assertion',
            severity: 'error',
            file: 'src/pricing/discount.test.ts',
            line: 12,
            column: 5,
            message: 'Vacuous assertion: comparing static literals (true vs true).',
          },
          {
            ruleId: 'mock-abuse',
            severity: 'warning',
            file: 'src/pricing/discount.test.ts',
            line: 1,
            column: 1,
            message: 'High mock-to-assertion ratio (4 mocks vs 1 effective assertion).',
          },
        ],
        fileMetrics: [],
      },
      mutation: {
        totalMutants: 8,
        killed: 4,
        survived: 4,
        timeouts: 0,
        errors: 0,
        score: 50,
        durationMs: 1120,
        results: [
          {
            id: 'M2',
            file: 'src/pricing/discount.ts',
            line: 18,
            column: 12,
            operator: 'boundary',
            original: '>=',
            mutated: '>',
            status: 'survived',
            durationMs: 140,
          },
          {
            id: 'M5',
            file: 'src/pricing/discount.ts',
            line: 22,
            column: 8,
            operator: 'equality',
            original: '===',
            mutated: '!==',
            status: 'killed',
            durationMs: 135,
          },
        ],
      },
      specCoverage: {
        specPath: 'LIN-412',
        totalRequirements: 3,
        coveredCount: 1,
        coverageRatio: 1 / 3,
        evaluatedBy: 'openai',
        requirements: [
          {
            id: 'REQ-1',
            text: 'Reject expired webhook signatures before processing payment',
            keywords: ['reject', 'expired', 'webhook'],
            covered: false,
            matchedFiles: [],
            matchedSymbols: [],
            llmVerdict: 'missing',
            llmReason: 'No signature expiry check found in diff.',
          },
          {
            id: 'REQ-2',
            text: 'Apply annual discount only when seatCount >= 5',
            keywords: ['annual', 'discount', 'seatcount'],
            covered: true,
            matchedFiles: ['src/pricing/discount.ts'],
            matchedSymbols: ['calculateDiscount'],
            llmVerdict: 'partial',
            llmReason: 'Logic present, but boundary mutant seats >= 5 -> > 5 survived.',
          },
          {
            id: 'REQ-3',
            text: 'Persist idempotency key on retryable charges',
            keywords: ['idempotency', 'retryable', 'charges'],
            covered: false,
            matchedFiles: [],
            matchedSymbols: [],
            llmVerdict: 'missing',
            llmReason: 'Idempotency store not updated.',
          },
        ],
      },
      passed: false,
      failureReasons: [
        '1 critical test integrity error(s) detected.',
        'Diff mutation score 50.0% is below threshold 70%.',
      ],
    },
  });

  store.insertRun({
    repoSlug: 'acme/ml-worker',
    branch: 'fix/batch-timeout-guard',
    prNumber: 91,
    report: {
      timestamp: new Date(now - 1000 * 60 * 5).toISOString(),
      repoRoot: '/repos/acme/ml-worker',
      baseRef: 'main',
      diffFiles: [
        {
          path: 'worker/batch.py',
          status: 'modified',
          addedRanges: [{ start: 10, end: 28 }],
          addedLines: ['if len(items) > 64: raise ValueError("batch limit")'],
        },
        {
          path: 'worker/test_batch.py',
          status: 'modified',
          addedRanges: [{ start: 1, end: 22 }],
          addedLines: ['assert len(res) == 64'],
        },
      ],
      integrity: {
        filesScanned: 2,
        testFilesScanned: 1,
        totalTests: 5,
        totalAssertions: 9,
        totalMocks: 1,
        findings: [],
        fileMetrics: [],
      },
      mutation: {
        totalMutants: 6,
        killed: 6,
        survived: 0,
        timeouts: 0,
        errors: 0,
        score: 100,
        durationMs: 890,
        results: [],
      },
      specCoverage: {
        specPath: 'JIRA-89',
        totalRequirements: 2,
        coveredCount: 2,
        coverageRatio: 1,
        evaluatedBy: 'deterministic',
        requirements: [
          {
            id: 'REQ-1',
            text: 'Propagate InferenceTimeoutError instead of swallowing exceptions',
            keywords: ['propagate', 'inferencetimeouterror'],
            covered: true,
            matchedFiles: ['worker/batch.py'],
            matchedSymbols: ['run_batch'],
          },
          {
            id: 'REQ-2',
            text: 'Cap batch size at 64 items per worker call',
            keywords: ['batch', 'size', '64'],
            covered: true,
            matchedFiles: ['worker/batch.py', 'worker/test_batch.py'],
            matchedSymbols: ['test_batch_cap_64'],
          },
        ],
      },
      passed: true,
      failureReasons: [],
    },
  });

  return { runsCreated: 2, specsCreated: 2 };
}
