import crypto from 'node:crypto';
import http from 'node:http';
import { verifyGitHubWebhookSignature, type FetchLike, type VerificationReport } from '@specproof/core';
import { z } from 'zod';
import {
  PLAN_CATALOG,
  parseLemonSqueezyWebhook,
  verifyLemonSqueezySignature,
} from './billing.js';
import { renderDashboardHtml } from './dashboardHtml.js';
import { seedDemoData } from './demoData.js';
import { pullExternalIssueSpec } from './issueSync.js';
import { CloudStore } from './store.js';

export interface CloudServerOptions {
  dbPath: string;
  apiToken?: string;
  githubWebhookSecret?: string;
  lemonSqueezyWebhookSecret?: string;
  enforcePlanLimits?: boolean;
  fetchImpl?: FetchLike;
}

export interface CloudServerHandle {
  server: http.Server;
  store: CloudStore;
}

const MAX_BODY_BYTES = 2 * 1024 * 1024;

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const PolicyPatchSchema = z.object({
  minMutationScore: z.number().finite().min(0).max(100).optional(),
  blockOnMockAbuse: z.boolean().optional(),
  blockOnVacuous: z.boolean().optional(),
  requireSpecMatch: z.boolean().optional(),
});

const BillingPatchSchema = z.object({
  plan: z.enum(['oss', 'team', 'scale', 'enterprise']).optional(),
  status: z.enum(['active', 'trialing', 'past_due', 'canceled']).optional(),
  maxRepos: z.number().int().positive().max(10_000).nullable().optional(),
  customerEmail: z.string().trim().email().max(200).nullable().optional(),
  checkoutUrl: z.string().trim().url().max(500).nullable().optional(),
});

const SpecUpsertSchema = z.object({
  externalId: z.string().trim().min(1).max(64),
  source: z.enum(['linear', 'jira', 'github', 'manual']).default('manual'),
  repoSlug: z.string().trim().min(1).max(120).default('default'),
  title: z.string().trim().min(1).max(200),
  checklistMarkdown: z.string().trim().min(1).max(20_000),
});

const SpecPullSchema = z.object({
  source: z.enum(['linear', 'jira', 'github']),
  externalId: z.string().trim().min(1).max(64),
  repoSlug: z.string().trim().min(1).max(120),
});

const RunIngestSchema = z.object({
  repoSlug: z.string().trim().min(1).max(120).optional(),
  branch: z.string().trim().min(1).max(120).optional(),
  prNumber: z.number().int().positive().max(10_000_000).optional(),
  report: z
    .object({
      timestamp: z.string().min(1).refine((v) => Number.isFinite(Date.parse(v)), 'Invalid ISO timestamp'),
      repoRoot: z.string().min(1),
      diffFiles: z.array(z.unknown()),
      integrity: z
        .object({
          findings: z.array(z.unknown()),
        })
        .passthrough(),
      passed: z.boolean(),
      failureReasons: z.array(z.string()),
    })
    .passthrough(),
});

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

async function readRawBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Request body exceeds 2 MB limit.');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const buf = await readRawBody(req);
  const raw = buf.toString('utf8');
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, 'Malformed JSON request body.');
  }
}

function isAuthorized(req: http.IncomingMessage, apiToken?: string): boolean {
  if (!apiToken) {
    return true;
  }
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) {
    return false;
  }
  const supplied = Buffer.from(auth.slice('Bearer '.length));
  const expected = Buffer.from(apiToken);
  if (supplied.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(supplied, expected);
}

function assertSameOriginIfBrowser(req: http.IncomingMessage): void {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) {
    return;
  }
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.host !== host) {
      throw new HttpError(403, 'Cross-origin mutation rejected.');
    }
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    throw new HttpError(403, 'Invalid Origin header.');
  }
}

function assertJsonContentType(req: http.IncomingMessage): void {
  const ct = String(req.headers['content-type'] ?? '').toLowerCase();
  if (!ct.includes('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }
}

/**
 * Creates the SpecProof Team Cloud HTTP server (REST ingestion + SSR dashboard).
 */
export function createCloudServer(options: CloudServerOptions): CloudServerHandle {
  const store = new CloudStore(options.dbPath);

  const server = http.createServer(async (req, res) => {
    try {
      let url: URL;
      try {
        url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      } catch {
        sendJson(res, 400, { error: 'Malformed request URL' });
        return;
      }

      const method = req.method ?? 'GET';

      if (method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/public/plans') {
        const billing = store.getBilling();
        sendJson(res, 200, {
          catalog: PLAN_CATALOG,
          checkoutUrls: {
            team: process.env.SPECPROOF_TEAM_CHECKOUT_URL ?? billing.checkoutUrl ?? null,
            scale: process.env.SPECPROOF_SCALE_CHECKOUT_URL ?? null,
          },
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
        });
        res.end(renderDashboardHtml());
        return;
      }

      if (method === 'POST' && url.pathname === '/api/webhooks/github') {
        const rawBuf = await readRawBody(req);
        const secret = options.githubWebhookSecret ?? process.env.SPECPROOF_GITHUB_WEBHOOK_SECRET;
        if (!secret) {
          sendJson(res, 503, { error: 'GitHub webhook secret not configured.' });
          return;
        }
        const sig = req.headers['x-hub-signature-256'];
        if (typeof sig !== 'string' || !verifyGitHubWebhookSignature(rawBuf, sig, secret)) {
          sendJson(res, 401, { error: 'Invalid GitHub webhook signature.' });
          return;
        }
        let payload: { repository?: { full_name?: string }; pull_request?: { number?: number } };
        try {
          payload = JSON.parse(rawBuf.toString('utf8')) as {
            repository?: { full_name?: string };
            pull_request?: { number?: number };
          };
        } catch {
          sendJson(res, 400, { error: 'Malformed webhook JSON payload.' });
          return;
        }
        const eventName = String(req.headers['x-github-event'] ?? 'unknown');
        const repoName = payload.repository?.full_name ?? 'unknown';
        store.recordAudit('github_webhook', repoName, `${eventName} pr=${payload.pull_request?.number ?? '-'}`);
        sendJson(res, 202, { accepted: true, event: eventName, repository: repoName });
        return;
      }

      if (method === 'POST' && url.pathname === '/api/webhooks/lemonsqueezy') {
        const rawBuf = await readRawBody(req);
        const secret = options.lemonSqueezyWebhookSecret ?? process.env.SPECPROOF_LEMONSQUEEZY_WEBHOOK_SECRET;
        if (!secret) {
          sendJson(res, 503, { error: 'Lemon Squeezy webhook secret not configured.' });
          return;
        }
        const sig = req.headers['x-signature'];
        if (typeof sig !== 'string' || !verifyLemonSqueezySignature(rawBuf, sig, secret)) {
          sendJson(res, 401, { error: 'Invalid Lemon Squeezy webhook signature.' });
          return;
        }
        let payload: unknown;
        try {
          payload = JSON.parse(rawBuf.toString('utf8')) as unknown;
        } catch {
          sendJson(res, 400, { error: 'Malformed Lemon Squeezy JSON payload.' });
          return;
        }
        const parsedWebhook = parseLemonSqueezyWebhook(payload);
        const updated = store.updateBilling({
          plan: parsedWebhook.plan,
          status: parsedWebhook.status,
          provider: 'lemonsqueezy',
          customerEmail: parsedWebhook.customerEmail,
          externalSubscriptionId: parsedWebhook.externalSubscriptionId,
        });
        store.recordAudit('lemonsqueezy_webhook', parsedWebhook.eventName, `plan=${updated.plan} status=${updated.status}`);
        sendJson(res, 202, { accepted: true, event: parsedWebhook.eventName, billing: updated });
        return;
      }

      if (url.pathname.startsWith('/api/') && !isAuthorized(req, options.apiToken)) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }

      if ((method === 'POST' || method === 'PUT' || method === 'DELETE') && url.pathname.startsWith('/api/')) {
        assertSameOriginIfBrowser(req);
      }

      if (method === 'GET' && url.pathname === '/api/runs') {
        const limit = Number(url.searchParams.get('limit') ?? 50);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const repo = url.searchParams.get('repo') ?? undefined;
        const statusParam = url.searchParams.get('status');
        const status = statusParam === 'passed' || statusParam === 'failed' ? statusParam : undefined;

        sendJson(res, 200, {
          stats: store.getStats(),
          trends: store.getTrends(),
          runs: store.listRunSummaries({
            limit: Number.isFinite(limit) ? limit : 50,
            offset: Number.isFinite(offset) ? offset : 0,
            repo,
            status,
          }),
        });
        return;
      }

      if (method === 'GET' && url.pathname.startsWith('/api/runs/')) {
        let id: string;
        try {
          id = decodeURIComponent(url.pathname.slice('/api/runs/'.length));
        } catch {
          sendJson(res, 400, { error: 'Malformed run id' });
          return;
        }
        const run = store.getRun(id);
        if (!run) {
          sendJson(res, 404, { error: 'Run not found' });
          return;
        }
        sendJson(res, 200, run);
        return;
      }

      if (method === 'DELETE' && url.pathname.startsWith('/api/runs/')) {
        let id: string;
        try {
          id = decodeURIComponent(url.pathname.slice('/api/runs/'.length));
        } catch {
          sendJson(res, 400, { error: 'Malformed run id' });
          return;
        }
        const deleted = store.deleteRun(id);
        if (!deleted) {
          sendJson(res, 404, { error: 'Run not found' });
          return;
        }
        sendJson(res, 200, { deleted: true, id });
        return;
      }

      if (method === 'POST' && url.pathname === '/api/runs') {
        assertJsonContentType(req);
        const body = await readJsonBody(req);
        const parsed = RunIngestSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Invalid run payload', details: parsed.error.issues });
          return;
        }

        const enforcePlans = options.enforcePlanLimits ?? process.env.SPECPROOF_ENFORCE_PLANS === '1';
        const effectiveRepoSlug =
          parsed.data.repoSlug?.trim() ||
          parsed.data.report.repoRoot.split(/[\\/]/).filter(Boolean).pop() ||
          'local-repo';
        if (enforcePlans) {
          const eligibility = store.canIngestRepo(effectiveRepoSlug);
          if (!eligibility.allowed) {
            sendJson(res, 402, {
              error: `Plan '${eligibility.billing.plan}' repository limit reached (${eligibility.distinctRepos}/${eligibility.billing.maxRepos ?? 'unlimited'}) or subscription inactive (${eligibility.billing.status}).`,
              code: 'PLAN_REPO_LIMIT_REACHED',
              plan: eligibility.billing.plan,
              status: eligibility.billing.status,
              maxRepos: eligibility.billing.maxRepos,
              distinctRepos: eligibility.distinctRepos,
              upgradeUrl: eligibility.billing.checkoutUrl,
            });
            return;
          }
        }

        const stored = store.insertRun({
          repoSlug: effectiveRepoSlug,
          branch: parsed.data.branch,
          prNumber: parsed.data.prNumber,
          report: parsed.data.report as unknown as VerificationReport,
        });
        sendJson(res, 201, stored);
        return;
      }

      if (method === 'GET' && url.pathname === '/api/trends') {
        sendJson(res, 200, { trends: store.getTrends() });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/audit') {
        sendJson(res, 200, { auditLogs: store.listAuditLogs() });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/export') {
        const format = url.searchParams.get('format') ?? 'json';
        if (format === 'csv') {
          res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="specproof-runs.csv"',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store',
          });
          res.end(store.exportRunsCsv());
          return;
        }
        sendJson(res, 200, {
          exportedAt: new Date().toISOString(),
          stats: store.getStats(),
          policy: store.getPolicy(),
          runs: store.listRuns(100),
          auditLogs: store.listAuditLogs(200),
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/billing') {
        const billing = store.getBilling();
        const check = store.canIngestRepo('__probe__');
        sendJson(res, 200, {
          billing,
          distinctRepos: check.distinctRepos,
          catalog: PLAN_CATALOG,
        });
        return;
      }

      if (method === 'PUT' && url.pathname === '/api/billing') {
        assertJsonContentType(req);
        const body = await readJsonBody(req);
        const parsed = BillingPatchSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Invalid billing payload', details: parsed.error.issues });
          return;
        }
        const updated = store.updateBilling({
          ...parsed.data,
          provider: 'manual',
        });
        sendJson(res, 200, updated);
        return;
      }

      if (method === 'GET' && url.pathname === '/api/policies') {
        sendJson(res, 200, store.getPolicy());
        return;
      }

      if (method === 'PUT' && url.pathname === '/api/policies') {
        assertJsonContentType(req);
        const body = await readJsonBody(req);
        const parsed = PolicyPatchSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Invalid policy payload', details: parsed.error.issues });
          return;
        }
        sendJson(res, 200, store.updatePolicy(parsed.data));
        return;
      }

      if (method === 'GET' && url.pathname === '/api/specs') {
        const repo = url.searchParams.get('repo') ?? undefined;
        sendJson(res, 200, { specs: store.listSpecs(30, repo) });
        return;
      }

      if (method === 'POST' && url.pathname === '/api/specs') {
        assertJsonContentType(req);
        const body = await readJsonBody(req);
        const parsed = SpecUpsertSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Invalid spec payload', details: parsed.error.issues });
          return;
        }
        const saved = store.upsertSpec(parsed.data);
        sendJson(res, 201, saved);
        return;
      }

      if (method === 'POST' && url.pathname === '/api/specs/pull') {
        assertJsonContentType(req);
        const body = await readJsonBody(req);
        const parsed = SpecPullSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Invalid pull spec payload', details: parsed.error.issues });
          return;
        }
        const pulled = await pullExternalIssueSpec({
          ...parsed.data,
          fetchImpl: options.fetchImpl,
        });
        const saved = store.upsertSpec(pulled);
        sendJson(res, 201, saved);
        return;
      }

      if (method === 'DELETE' && url.pathname.startsWith('/api/specs/')) {
        let id: string;
        try {
          id = decodeURIComponent(url.pathname.slice('/api/specs/'.length));
        } catch {
          sendJson(res, 400, { error: 'Malformed spec id' });
          return;
        }
        const deleted = store.deleteSpec(id);
        if (!deleted) {
          sendJson(res, 404, { error: 'Spec not found' });
          return;
        }
        sendJson(res, 200, { deleted: true, id });
        return;
      }

      if (method === 'POST' && url.pathname === '/api/demo') {
        if (process.env.NODE_ENV === 'production' && process.env.SPECPROOF_ALLOW_DEMO !== '1') {
          sendJson(res, 403, { error: 'Demo seeding is disabled in production.' });
          return;
        }
        sendJson(res, 201, seedDemoData(store));
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
        return;
      }
      sendJson(res, 500, { error: 'Internal server error' });
    }
  });

  return { server, store };
}
