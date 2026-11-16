import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  SPECPROOF_COMMENT_MARKER,
  analyzeFilesIntegrity,
  buildCheckRunAnnotations,
  evaluateSpecWithByokLlm,
  fetchCloudPolicyAndSpecs,
  postOrUpdatePrComment,
  publishGitHubCheckRun,
  resolveByokCredentials,
  uploadVerificationReport,
  verifyGitHubWebhookSignature,
  type FetchLike,
  type SpecCoverageSummary,
  type VerificationReport,
} from '../src/index.js';

describe('Python test & source integrity', () => {
  it('detects skipped/empty/vacuous/mock-abuse/swallowed errors and ignores docstrings & multi-line signatures', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-py-int-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'app'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'app/worker.py'),
        [
          'def run_job():',
          '    """Docstring with except Exception: pass"""',
          '    try:',
          '        return 1',
          '    except Exception as exc:',
          '        print(exc)',
        ].join('\n'),
      );

      fs.writeFileSync(
        path.join(tmpDir, 'app/test_worker.py'),
        [
          'import pytest',
          'from unittest.mock import patch, MagicMock',
          '',
          '@patch("app.worker.db")',
          '@patch("app.worker.queue")',
          'def test_vacuous():',
          '    m = MagicMock()',
          '    assert True',
          '',
          'async def test_empty():',
          '    """assert something inside docstring should NOT count as an assertion"""',
          '    x = 1 + 1',
          '',
          'def test_multiline_ok(',
          '    client,',
          '    payload,',
          '):',
          '    assert "a" == "b"  # unequal strings must NOT trigger vacuous-assertion',
          '',
          '@pytest.mark.skip(reason="flaky")',
          'def test_skipped():',
          '    assert 2 == 3',
        ].join('\n'),
      );

      const summary = analyzeFilesIntegrity(
        tmpDir,
        ['app/worker.py', 'app/test_worker.py'],
        DEFAULT_CONFIG,
      );

      const rules = summary.findings.map((f) => f.ruleId);
      expect(rules.filter((r) => r === 'swallowed-error')).toHaveLength(1);
      expect(rules.filter((r) => r === 'vacuous-assertion')).toHaveLength(1);
      expect(rules.filter((r) => r === 'empty-test')).toHaveLength(1);
      expect(rules).toContain('skipped-test');
      expect(rules).toContain('mock-abuse');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('BYOK LLM spec evaluator', () => {
  const baseCoverage: SpecCoverageSummary = {
    specPath: 'SPEC.md',
    totalRequirements: 2,
    coveredCount: 0,
    coverageRatio: 0,
    evaluatedBy: 'deterministic',
    requirements: [
      {
        id: 'REQ-1',
        text: 'Reject expired tokens',
        keywords: ['reject', 'expired', 'tokens'],
        covered: false,
        matchedFiles: [],
        matchedSymbols: [],
      },
      {
        id: 'REQ-2',
        text: 'Rotate refresh keys',
        keywords: ['rotate', 'refresh', 'keys'],
        covered: false,
        matchedFiles: [],
        matchedSymbols: [],
      },
    ],
  };

  it('evaluates OpenAI, Anthropic, and Gemini responses and handles errors & missing keys', async () => {
    const openaiFetch: FetchLike = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  items: [
                    { id: 'REQ-1', verdict: 'covered', reason: 'Verified in verifyToken()' },
                    { id: 'REQ-2', verdict: 'partial', reason: 'Missing expiry test' },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );

    const openaiResult = await evaluateSpecWithByokLlm(baseCoverage, [], undefined, {
      provider: 'openai',
      apiKey: 'test-key',
      fetchImpl: openaiFetch,
    });
    expect(openaiResult.evaluatedBy).toBe('openai');
    expect(openaiResult.coveredCount).toBe(1);
    expect(openaiResult.requirements[1]?.llmVerdict).toBe('partial');

    const anthropicFetch: FetchLike = async (url, init) => {
      expect(String(url)).toContain('anthropic.com/v1/messages');
      expect((init?.headers as Record<string, string>)['x-api-key']).toBe('ant-key');
      return new Response(
        JSON.stringify({
          content: [
            {
              text: '```json\n{"items":[{"id":"REQ-1","verdict":"covered","reason":"Anthropic OK"}]}\n```',
            },
          ],
        }),
        { status: 200 },
      );
    };
    const antRes = await evaluateSpecWithByokLlm(baseCoverage, [], undefined, {
      provider: 'anthropic',
      apiKey: 'ant-key',
      fetchImpl: anthropicFetch,
    });
    expect(antRes.evaluatedBy).toBe('anthropic');
    expect(antRes.requirements[0]?.llmReason).toBe('Anthropic OK');

    const geminiFetch: FetchLike = async (url, init) => {
      expect(String(url)).not.toContain('key=');
      expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('gem-key');
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: '{"items":[{"id":"REQ-2","verdict":"covered","reason":"Gemini OK"}]}' },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    };
    const gemRes = await evaluateSpecWithByokLlm(baseCoverage, [], undefined, {
      provider: 'gemini',
      apiKey: 'gem-key',
      fetchImpl: geminiFetch,
    });
    expect(gemRes.evaluatedBy).toBe('gemini');
    expect(gemRes.requirements[1]?.covered).toBe(true);

    // Non-2xx and invalid provider errors
    await expect(
      evaluateSpecWithByokLlm(baseCoverage, [], undefined, {
        provider: 'openai',
        apiKey: 'bad',
        fetchImpl: async () => new Response('unauthorized', { status: 401 }),
      }),
    ).rejects.toThrow(/OpenAI API error: 401/);

    expect(() => resolveByokCredentials({ provider: 'unknown' as never })).toThrow(
      /Unsupported LLM provider/,
    );
  });
});

describe('GitHub sticky PR comment & Cloud client', () => {
  it('paginates PR comments to update sticky comment and validates slugs/URLs', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, body: 'other' }));
    const methods: string[] = [];

    const paginatedFetch: FetchLike = async (url, init) => {
      const m = init?.method ?? 'GET';
      methods.push(m);
      const parsedUrl = new URL(String(url));
      const page = parsedUrl.searchParams.get('page');
      if (m === 'GET' && page === '1') {
        return new Response(JSON.stringify(page1), { status: 200 });
      }
      if (m === 'GET' && page === '2') {
        return new Response(
          JSON.stringify([{ id: 999, body: `${SPECPROOF_COMMENT_MARKER}\nold` }]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ id: 999 }), { status: 200 });
    };

    const res = await postOrUpdatePrComment({
      repoSlug: 'acme/app',
      prNumber: 7,
      token: 'ghp_test',
      markdownBody: '## Updated',
      fetchImpl: paginatedFetch,
    });
    expect(res.action).toBe('updated');
    expect(res.commentId).toBe(999);
    expect(methods).toEqual(['GET', 'GET', 'PATCH']);

    await expect(
      postOrUpdatePrComment({
        repoSlug: '../evil',
        prNumber: 1,
        token: 't',
        markdownBody: 'x',
      }),
    ).rejects.toThrow(/Invalid repository slug/);
  });

  it('fetches cloud policies/specs and uploads verification reports safely', async () => {
    const sampleReport: VerificationReport = {
      timestamp: new Date().toISOString(),
      repoRoot: '/tmp/repo',
      diffFiles: [],
      integrity: {
        filesScanned: 0,
        testFilesScanned: 0,
        totalTests: 0,
        totalAssertions: 0,
        totalMocks: 0,
        findings: [],
        fileMetrics: [],
      },
      passed: true,
      failureReasons: [],
    };

    const mockFetch: FetchLike = async (url, init) => {
      const u = String(url);
      if (u.endsWith('/api/policies')) {
        return new Response(
          JSON.stringify({
            minMutationScore: 85,
            blockOnMockAbuse: true,
            blockOnVacuous: true,
            requireSpecMatch: true,
          }),
          { status: 200 },
        );
      }
      if (u.endsWith('/api/specs')) {
        return new Response(
          JSON.stringify({
            specs: [
              {
                id: '1',
                externalId: 'LIN-1',
                source: 'linear',
                repoSlug: 'acme/app',
                title: 'Auth',
                checklistMarkdown: '- [ ] Check JWT',
              },
            ],
          }),
          { status: 200 },
        );
      }
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify({ id: 'run-123' }), { status: 201 });
    };

    const synced = await fetchCloudPolicyAndSpecs({
      cloudUrl: 'http://localhost:4310',
      repoSlug: 'acme/app',
      fetchImpl: mockFetch,
    });
    expect(synced.policy.minMutationScore).toBe(85);
    expect(synced.specs).toHaveLength(1);

    const uploaded = await uploadVerificationReport({
      cloudUrl: 'http://localhost:4310',
      report: sampleReport,
      repoSlug: 'acme/app',
      fetchImpl: mockFetch,
    });
    expect(uploaded.id).toBe('run-123');
    expect(uploaded.url).toBe('http://localhost:4310/?run=run-123');

    // Non-local HTTP with bearer token must be rejected
    await expect(
      uploadVerificationReport({
        cloudUrl: 'http://cloud.example.com',
        report: sampleReport,
        token: 'secret',
      }),
    ).rejects.toThrow(/must use HTTPS/);
  });

  it('detects Go test skipped, empty, and vacuous assertions while ignoring comments and strings', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specproof-go-int-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'pkg'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'pkg/auth_test.go'),
        [
          'package pkg',
          '',
          'import "testing"',
          '',
          '// t.Skip("comment should not count")',
          'func TestSkippedFeature(t *testing.T) {',
          '\tt.Skip("wip")',
          '}',
          '',
          'func TestEmptyBody(t *testing.T) {',
          '\t_ = 1 + 1',
          '}',
          '',
          'func TestVacuousCheck(t *testing.T) {',
          '\tmsg := "assert.True(t, true)"',
          '\t_ = msg',
          '\tassert.True(t, true)',
          '}',
          '',
          'func TestValidCheck(t *testing.T) {',
          '\tif 2+2 != 4 {',
          '\t\tt.Fatalf("math failed")',
          '\t}',
          '}',
        ].join('\n'),
      );

      const summary = analyzeFilesIntegrity(
        tmpDir,
        ['pkg/auth_test.go'],
        undefined,
        DEFAULT_CONFIG,
      );
      expect(summary.testFilesScanned).toBe(1);
      expect(summary.totalTests).toBe(4);
      expect(summary.fileMetrics[0]?.skippedCount).toBe(1);
      const rules = summary.findings.map((f) => f.ruleId);
      expect(rules).toContain('skipped-test');
      expect(rules).toContain('empty-test');
      expect(rules).toContain('vacuous-assertion');
      expect(summary.findings).toHaveLength(3);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('verifies GitHub webhook HMAC signatures and publishes Check Run annotations', async () => {
    const secret = 'whsec_test_123';
    const rawBody = Buffer.from(JSON.stringify({ action: 'synchronize' }), 'utf8');
    const validSig =
      'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    expect(verifyGitHubWebhookSignature(rawBody, validSig, secret)).toBe(true);
    expect(verifyGitHubWebhookSignature(rawBody, 'sha256=' + '0'.repeat(64), secret)).toBe(false);
    expect(verifyGitHubWebhookSignature(rawBody, undefined, secret)).toBe(false);

    const report: VerificationReport = {
      timestamp: new Date().toISOString(),
      repoRoot: '/tmp/repo',
      diffFiles: [],
      integrity: {
        filesScanned: 1,
        testFilesScanned: 1,
        totalTests: 1,
        totalAssertions: 1,
        totalMocks: 0,
        findings: [
          {
            ruleId: 'vacuous-assertion',
            severity: 'error',
            file: 'src/a.test.ts',
            line: 4,
            column: 1,
            message: 'Vacuous assertion',
          },
        ],
        fileMetrics: [],
      },
      mutation: {
        totalMutants: 1,
        killed: 0,
        survived: 1,
        timeouts: 0,
        errors: 0,
        score: 0,
        durationMs: 10,
        results: [
          {
            id: 'mut-1',
            file: 'src/a.ts',
            line: 9,
            operator: 'boundary',
            original: '>=',
            mutated: '>',
            status: 'survived',
            durationMs: 10,
          },
        ],
      },
      passed: false,
      failureReasons: ['Integrity error'],
    };

    const annotations = buildCheckRunAnnotations(report);
    expect(annotations).toHaveLength(2);
    expect(annotations[0]?.annotation_level).toBe('failure');
    expect(annotations[1]?.annotation_level).toBe('warning');

    let postedConclusion = '';
    const mockFetch: FetchLike = async (url, init) => {
      expect(String(url)).toContain('/repos/acme/app/check-runs');
      const payload = JSON.parse(String(init?.body)) as {
        head_sha: string;
        conclusion: string;
        output: { annotations: unknown[] };
      };
      expect(payload.head_sha).toBe('abcdef1');
      postedConclusion = payload.conclusion;
      expect(payload.output.annotations).toHaveLength(2);
      return new Response(
        JSON.stringify({ id: 55, html_url: 'https://github.com/acme/app/runs/55' }),
        { status: 201 },
      );
    };

    const published = await publishGitHubCheckRun({
      repoSlug: 'acme/app',
      headSha: 'abcdef1',
      token: 'ghp_test',
      report,
      markdownSummary: '## Failed',
      fetchImpl: mockFetch,
    });
    expect(postedConclusion).toBe('failure');
    expect(published.id).toBe(55);
    expect(published.annotationsCount).toBe(2);
  });
});
