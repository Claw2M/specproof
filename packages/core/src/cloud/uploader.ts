import { validateHttpUrl, validateRepoSlug } from '../security/pathSafety.js';
import type { FetchLike } from '../spec/byokEvaluator.js';
import type { VerificationReport } from '../types.js';

export interface UploadReportOptions {
  cloudUrl: string;
  report: VerificationReport;
  repoSlug?: string;
  branch?: string;
  prNumber?: number;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export interface UploadReportResult {
  id: string;
  url: string;
}

export interface CloudPolicyPayload {
  minMutationScore: number;
  blockOnMockAbuse: boolean;
  blockOnVacuous: boolean;
  requireSpecMatch: boolean;
}

export interface CloudSpecItem {
  id: string;
  externalId: string;
  source: 'linear' | 'jira' | 'github' | 'manual';
  repoSlug: string;
  title: string;
  checklistMarkdown: string;
}

/**
 * Fetches organization-wide policy thresholds and synced external specs from Team Cloud.
 */
export async function fetchCloudPolicyAndSpecs(options: {
  cloudUrl: string;
  repoSlug?: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}): Promise<{ policy: CloudPolicyPayload; specs: CloudSpecItem[] }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const parsedUrl = validateHttpUrl(options.cloudUrl, Boolean(options.token));
  const baseUrl = parsedUrl.toString().replace(/\/$/, '');
  const safeRepo = options.repoSlug ? validateRepoSlug(options.repoSlug) : undefined;
  const timeoutMs = options.timeoutMs ?? 15_000;

  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const [polRes, specsRes] = await Promise.all([
    fetchImpl(`${baseUrl}/api/policies`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    }),
    fetchImpl(`${baseUrl}/api/specs`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    }),
  ]);

  if (!polRes.ok) {
    throw new Error(`SpecProof Cloud policy fetch failed: ${polRes.status}`);
  }
  if (!specsRes.ok) {
    throw new Error(`SpecProof Cloud specs fetch failed: ${specsRes.status}`);
  }

  const policy = (await polRes.json()) as CloudPolicyPayload;
  const specsPayload = (await specsRes.json()) as { specs?: CloudSpecItem[] };
  const allSpecs = specsPayload.specs ?? [];
  const filteredSpecs = safeRepo
    ? allSpecs.filter((s) => s.repoSlug === safeRepo || s.repoSlug === 'default')
    : allSpecs;

  return { policy, specs: filteredSpecs };
}

/**
 * Uploads a SpecProof verification report to a Team Cloud or self-hosted control plane.
 */
export async function uploadVerificationReport(
  options: UploadReportOptions,
): Promise<UploadReportResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const parsedUrl = validateHttpUrl(options.cloudUrl, Boolean(options.token));
  const baseUrl = parsedUrl.toString().replace(/\/$/, '');
  const safeRepo = options.repoSlug ? validateRepoSlug(options.repoSlug) : undefined;
  const timeoutMs = options.timeoutMs ?? 15_000;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetchImpl(`${baseUrl}/api/runs`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers,
    body: JSON.stringify({
      repoSlug: safeRepo,
      branch: options.branch?.trim() || undefined,
      prNumber: options.prNumber,
      report: options.report,
    }),
  });

  if (!res.ok) {
    throw new Error(`SpecProof Cloud upload failed: ${res.status} ${await res.text()}`);
  }

  const payload = (await res.json()) as { id?: unknown };
  if (typeof payload.id !== 'string' || payload.id.length === 0) {
    throw new Error('SpecProof Cloud upload returned an invalid response (missing run id).');
  }
  return {
    id: payload.id,
    url: `${baseUrl}/?run=${encodeURIComponent(payload.id)}`,
  };
}
