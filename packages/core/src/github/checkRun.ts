import crypto from 'node:crypto';
import { validateHttpUrl, validateRepoSlug } from '../security/pathSafety.js';
import type { FetchLike } from '../spec/byokEvaluator.js';
import type { VerificationReport } from '../types.js';

export interface CheckRunAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'failure' | 'warning' | 'notice';
  title: string;
  message: string;
}

export interface PublishCheckRunOptions {
  repoSlug: string;
  headSha: string;
  token: string;
  report: VerificationReport;
  markdownSummary: string;
  name?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export interface PublishCheckRunResult {
  id: number;
  htmlUrl?: string;
  annotationsCount: number;
}

/**
 * Verifies a GitHub webhook `X-Hub-Signature-256` HMAC digest in constant time.
 */
export function verifyGitHubWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=') || !secret) {
    return false;
  }
  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const expected = Buffer.from(`sha256=${digest}`, 'utf8');
  const actual = Buffer.from(signatureHeader, 'utf8');
  if (expected.length !== actual.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, actual);
}

/**
 * Converts SpecProof integrity findings and survived mutants into GitHub Check Run annotations.
 */
export function buildCheckRunAnnotations(report: VerificationReport): CheckRunAnnotation[] {
  const annotations: CheckRunAnnotation[] = [];

  for (const f of report.integrity.findings) {
    annotations.push({
      path: f.file,
      start_line: Math.max(1, f.line),
      end_line: Math.max(1, f.line),
      annotation_level: f.severity === 'error' ? 'failure' : 'warning',
      title: `SpecProof: ${f.ruleId}`,
      message: f.message,
    });
  }

  for (const m of report.mutation?.results ?? []) {
    if (m.status !== 'survived') {
      continue;
    }
    annotations.push({
      path: m.file,
      start_line: Math.max(1, m.line),
      end_line: Math.max(1, m.line),
      annotation_level: 'warning',
      title: `Survived Mutant (${m.operator})`,
      message: `Tests still passed after mutating "${m.original}" -> "${m.mutated}". Add an edge-case assertion.`,
    });
  }

  return annotations.slice(0, 50);
}

/**
 * Publishes a GitHub Check Run with inline annotations on integrity findings and survived mutants.
 */
export async function publishGitHubCheckRun(
  options: PublishCheckRunOptions,
): Promise<PublishCheckRunResult> {
  const safeRepo = validateRepoSlug(options.repoSlug);
  if (!/^[a-f0-9]{7,64}$/i.test(options.headSha.trim())) {
    throw new Error(`Invalid commit SHA: ${options.headSha}`);
  }
  const apiBase = validateHttpUrl(options.apiBaseUrl ?? 'https://api.github.com', true)
    .toString()
    .replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const annotations = buildCheckRunAnnotations(options.report);

  const res = await fetchImpl(`${apiBase}/repos/${safeRepo}/check-runs`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${options.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: options.name ?? 'SpecProof Verification Gate',
      head_sha: options.headSha.trim(),
      status: 'completed',
      conclusion: options.report.passed ? 'success' : 'failure',
      output: {
        title: options.report.passed
          ? 'SpecProof verification passed'
          : `SpecProof verification failed (${options.report.failureReasons.length} reason(s))`,
        summary: options.markdownSummary,
        annotations,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub Check Run API failed: ${res.status} ${await res.text()}`);
  }

  const created = (await res.json()) as { id: number; html_url?: string };
  return {
    id: created.id,
    htmlUrl: created.html_url,
    annotationsCount: annotations.length,
  };
}
