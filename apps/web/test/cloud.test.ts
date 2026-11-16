import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { VerificationReport } from '@specproof/core';
import { createCloudServer } from '../src/server.js';

function makeSampleReport(passed: boolean): VerificationReport {
  return {
    timestamp: new Date().toISOString(),
    repoRoot: '/tmp/sample-repo',
    baseRef: 'main',
    diffFiles: [
      {
        path: 'src/auth.ts',
        status: 'modified',
        addedRanges: [{ start: 10, end: 15 }],
        addedLines: ['return token.valid;'],
      },
    ],
    integrity: {
      filesScanned: 2,
      testFilesScanned: 1,
      totalTests: 2,
      totalAssertions: 2,
      totalMocks: 0,
      findings: passed
        ? []
        : [
            {
              ruleId: 'vacuous-assertion',
              severity: 'error',
              file: 'src/auth.test.ts',
              line: 5,
              column: 3,
              message: 'Vacuous assertion detected.',
            },
          ],
      fileMetrics: [],
    },
    mutation: {
      totalMutants: 4,
      killed: passed ? 4 : 1,
      survived: passed ? 0 : 3,
      timeouts: 0,
      errors: 0,
      score: passed ? 100 : 25,
      durationMs: 420,
      results: [],
    },
    passed,
    failureReasons: passed ? [] : ['1 critical test integrity error(s) detected.'],
  };
}

describe('SpecProof Team Cloud server & SQLite store', () => {
  it('enforces auth, validates inputs, deduplicates specs, and serves SSR dashboard', async () => {
    const { server, store } = createCloudServer({
      dbPath: ':memory:',
      apiToken: 'secret-token',
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('Unexpected server address');
      }
      const baseUrl = `http://127.0.0.1:${addr.port}`;

      // 1. Unauthenticated API GET & POST rejected when apiToken is configured
      const unauthGet = await fetch(`${baseUrl}/api/runs`);
      expect(unauthGet.status).toBe(401);
      const unauthPost = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: makeSampleReport(true) }),
      });
      expect(unauthPost.status).toBe(401);

      // 2. Malformed JSON & invalid policy score rejected with 400
      const badJsonRes = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-token',
        },
        body: '{bad',
      });
      expect(badJsonRes.status).toBe(400);

      const badPolicyRes = await fetch(`${baseUrl}/api/policies`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-token',
        },
        body: JSON.stringify({ minMutationScore: 150 }),
      });
      expect(badPolicyRes.status).toBe(400);

      // 3. Authorized POST ingested
      const postRes = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-token',
        },
        body: JSON.stringify({
          repoSlug: 'acme/payments',
          branch: 'feat/token-expiry',
          prNumber: 42,
          report: makeSampleReport(false),
        }),
      });
      expect(postRes.status).toBe(201);
      const created = (await postRes.json()) as { id: string; repoSlug: string; passed: boolean };
      expect(created.repoSlug).toBe('acme/payments');
      expect(created.passed).toBe(false);

      // 4. Stats, GET by ID & 404
      const listRes = await fetch(`${baseUrl}/api/runs`, {
        headers: { Authorization: 'Bearer secret-token' },
      });
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as {
        stats: { totalRuns: number; totalIntegrityFindings: number; avgMutationScore: number };
        runs: Array<{ id: string }>;
      };
      expect(listData.stats.totalRuns).toBe(1);
      expect(listData.stats.totalIntegrityFindings).toBe(1);
      expect(listData.stats.avgMutationScore).toBe(25);
      expect(listData.runs[0]?.id).toBe(created.id);

      const missingRun = await fetch(`${baseUrl}/api/runs/does-not-exist`, {
        headers: { Authorization: 'Bearer secret-token' },
      });
      expect(missingRun.status).toBe(404);

      // 5. Org policy update persists
      const polRes = await fetch(`${baseUrl}/api/policies`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-token',
        },
        body: JSON.stringify({ minMutationScore: 85, requireSpecMatch: true }),
      });
      expect(polRes.status).toBe(200);
      const polData = (await polRes.json()) as { minMutationScore: number; requireSpecMatch: boolean };
      expect(polData.minMutationScore).toBe(85);
      expect(polData.requireSpecMatch).toBe(true);

      // 6. Demo seeding called twice deduplicates specs via ON CONFLICT
      await fetch(`${baseUrl}/api/demo`, {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token' },
      });
      await fetch(`${baseUrl}/api/demo`, {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token' },
      });
      const specsRes = await fetch(`${baseUrl}/api/specs`, {
        headers: { Authorization: 'Bearer secret-token' },
      });
      const specsJson = (await specsRes.json()) as { specs: Array<{ externalId: string }> };
      expect(specsJson.specs).toHaveLength(2);

      // 7. Trends, Audit Logs, CSV Export, and DELETE endpoints work cleanly
      const trendsRes = await fetch(`${baseUrl}/api/trends`, {
        headers: { Authorization: 'Bearer secret-token' },
      });
      expect(trendsRes.status).toBe(200);
      const trendsJson = (await trendsRes.json()) as { trends: Array<{ repoSlug: string }> };
      expect(trendsJson.trends.length).toBeGreaterThanOrEqual(2);

      const auditRes = await fetch(`${baseUrl}/api/audit`, {
        headers: { Authorization: 'Bearer secret-token' },
      });
      expect(auditRes.status).toBe(200);
      const auditJson = (await auditRes.json()) as { auditLogs: Array<{ action: string }> };
      expect(auditJson.auditLogs.some((a) => a.action === 'policy_updated')).toBe(true);

      const csvRes = await fetch(`${baseUrl}/api/export?format=csv`, {
        headers: { Authorization: 'Bearer secret-token' },
      });
      expect(csvRes.status).toBe(200);
      expect(await csvRes.text()).toContain('acme/payments');

      const delRunRes = await fetch(`${baseUrl}/api/runs/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer secret-token' },
      });
      expect(delRunRes.status).toBe(200);

      // 8. SSR HTML dashboard renders cleanly with Framer dark-canvas design system
      const htmlRes = await fetch(`${baseUrl}/`);
      expect(htmlRes.status).toBe(200);
      const html = await htmlRes.text();
      expect(html).toContain('SpecProof');
      expect(html).toContain('meta name="color-scheme" content="dark"');
      expect(html).toContain('--canvas: #090909');
      expect(html).toContain('Synced Specs (Linear / Jira / GitHub)');
      expect(html).toContain('guide-dialog');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      store.close();
    }
  });

  it('verifies GitHub webhook signatures and pulls specs from GitHub & Linear APIs', async () => {
    const prevLinearKey = process.env.LINEAR_API_KEY;
    process.env.LINEAR_API_KEY = 'lin_test_key';

    // 1. Missing webhook secret returns 503
    const unconfigured = createCloudServer({ dbPath: ':memory:' });
    await new Promise<void>((resolve) => unconfigured.server.listen(0, '127.0.0.1', () => resolve()));
    try {
      const addr = unconfigured.server.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('Unexpected address');
      }
      const res503 = await fetch(`http://127.0.0.1:${addr.port}/api/webhooks/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(res503.status).toBe(503);
    } finally {
      await new Promise<void>((resolve) => unconfigured.server.close(() => resolve()));
      unconfigured.store.close();
    }

    // 2. Configured webhook + external spec pull
    const webhookSecret = 'whsec_cloud_test';
    const { server, store } = createCloudServer({
      dbPath: ':memory:',
      apiToken: 'cloud-tok',
      githubWebhookSecret: webhookSecret,
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes('api.linear.app/graphql')) {
          return new Response(
            JSON.stringify({
              data: {
                issue: {
                  identifier: 'ENG-42',
                  title: 'Harden OAuth callback',
                  description: '- [ ] Reject missing state\n- [ ] Enforce HTTPS redirect URI',
                },
              },
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            number: 19,
            title: 'Rate-limit login endpoint',
            body: '- [ ] Block after 5 failed attempts',
          }),
          { status: 200 },
        );
      },
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('Unexpected address');
      }
      const baseUrl = `http://127.0.0.1:${addr.port}`;

      const payload = JSON.stringify({
        repository: { full_name: 'acme/api' },
        pull_request: { number: 88 },
      });

      const badSigRes = await fetch(`${baseUrl}/api/webhooks/github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': 'sha256=' + 'f'.repeat(64),
        },
        body: payload,
      });
      expect(badSigRes.status).toBe(401);

      const goodSig =
        'sha256=' + crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
      const okWebhookRes = await fetch(`${baseUrl}/api/webhooks/github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': goodSig,
        },
        body: payload,
      });
      expect(okWebhookRes.status).toBe(202);
      const okWebhookJson = (await okWebhookRes.json()) as {
        accepted: boolean;
        event: string;
        repository: string;
      };
      expect(okWebhookJson.accepted).toBe(true);
      expect(okWebhookJson.event).toBe('pull_request');
      expect(okWebhookJson.repository).toBe('acme/api');

      const auditLogs = store.listAuditLogs(20);
      expect(auditLogs.some((a) => a.action === 'github_webhook' && a.targetId === 'acme/api')).toBe(
        true,
      );

      // Pull from Linear
      const linPull = await fetch(`${baseUrl}/api/specs/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer cloud-tok',
        },
        body: JSON.stringify({
          source: 'linear',
          externalId: 'ENG-42',
          repoSlug: 'acme/api',
        }),
      });
      expect(linPull.status).toBe(201);
      const linSaved = (await linPull.json()) as { externalId: string; checklistMarkdown: string };
      expect(linSaved.externalId).toBe('ENG-42');
      expect(linSaved.checklistMarkdown).toContain('Reject missing state');

      // Pull from GitHub issue
      const ghPull = await fetch(`${baseUrl}/api/specs/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer cloud-tok',
        },
        body: JSON.stringify({
          source: 'github',
          externalId: '#19',
          repoSlug: 'acme/api',
        }),
      });
      expect(ghPull.status).toBe(201);
      const ghSaved = (await ghPull.json()) as { externalId: string; title: string };
      expect(ghSaved.externalId).toBe('#19');
      expect(ghSaved.title).toBe('Rate-limit login endpoint');
    } finally {
      if (prevLinearKey === undefined) {
        delete process.env.LINEAR_API_KEY;
      } else {
        process.env.LINEAR_API_KEY = prevLinearKey;
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
      store.close();
    }
  });
});
