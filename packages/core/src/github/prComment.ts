import { validateHttpUrl, validateRepoSlug } from '../security/pathSafety.js';
import type { FetchLike } from '../spec/byokEvaluator.js';

export const SPECPROOF_COMMENT_MARKER = '<!-- specproof-report -->';

export interface PrCommentOptions {
  repoSlug: string;
  prNumber: number;
  token: string;
  markdownBody: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export interface PrCommentResult {
  action: 'created' | 'updated';
  commentId: number;
  htmlUrl?: string;
}

/**
 * Creates or updates a single sticky SpecProof verification comment on a GitHub Pull Request.
 */
export async function postOrUpdatePrComment(
  options: PrCommentOptions,
): Promise<PrCommentResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const safeRepo = validateRepoSlug(options.repoSlug);
  if (!Number.isInteger(options.prNumber) || options.prNumber <= 0) {
    throw new Error(`Invalid PR number: ${options.prNumber}`);
  }
  const apiUrl = validateHttpUrl(options.apiBaseUrl ?? 'https://api.github.com', true);
  const apiBase = apiUrl.toString().replace(/\/$/, '');
  const timeoutMs = options.timeoutMs ?? 15_000;
  const bodyWithMarker = `${SPECPROOF_COMMENT_MARKER}\n${options.markdownBody}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${options.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  let sticky: { id: number; body?: string; html_url?: string } | undefined;
  for (let page = 1; page <= 10; page += 1) {
    const listUrl = `${apiBase}/repos/${safeRepo}/issues/${options.prNumber}/comments?per_page=100&page=${page}`;
    const listRes = await fetchImpl(listUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!listRes.ok) {
      throw new Error(`GitHub list comments failed: ${listRes.status} ${await listRes.text()}`);
    }

    const batch = (await listRes.json()) as Array<{
      id: number;
      body?: string;
      html_url?: string;
    }>;
    sticky = batch.find((c) => c.body?.includes(SPECPROOF_COMMENT_MARKER));
    if (sticky || batch.length < 100) {
      break;
    }
  }

  if (sticky) {
    const patchUrl = `${apiBase}/repos/${safeRepo}/issues/comments/${sticky.id}`;
    const patchRes = await fetchImpl(patchUrl, {
      method: 'PATCH',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ body: bodyWithMarker }),
    });
    if (!patchRes.ok) {
      throw new Error(`GitHub update comment failed: ${patchRes.status} ${await patchRes.text()}`);
    }
    const updated = (await patchRes.json()) as { id: number; html_url?: string };
    return { action: 'updated', commentId: updated.id, htmlUrl: updated.html_url };
  }

  const createUrl = `${apiBase}/repos/${safeRepo}/issues/${options.prNumber}/comments`;
  const createRes = await fetchImpl(createUrl, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ body: bodyWithMarker }),
  });
  if (!createRes.ok) {
    throw new Error(`GitHub create comment failed: ${createRes.status} ${await createRes.text()}`);
  }
  const created = (await createRes.json()) as { id: number; html_url?: string };
  return { action: 'created', commentId: created.id, htmlUrl: created.html_url };
}
