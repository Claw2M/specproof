import { validateHttpUrl, validateRepoSlug, type FetchLike } from '@specproof/core';

export interface PullExternalIssueOptions {
  source: 'linear' | 'jira' | 'github';
  externalId: string;
  repoSlug: string;
  token?: string;
  jiraBaseUrl?: string;
  fetchImpl?: FetchLike;
}

export interface PulledIssueSpec {
  externalId: string;
  source: 'linear' | 'jira' | 'github';
  repoSlug: string;
  title: string;
  checklistMarkdown: string;
}

function extractChecklistLines(description: string, fallbackTitle: string): string {
  const lines = description
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+(?:\[[ xX]\]\s+)?/.test(l) || /^(?:AC|REQ)[-\s]*\d*\s*:/i.test(l));

  if (lines.length > 0) {
    return lines
      .map((l) => (l.startsWith('- [') || l.startsWith('* [') ? l : `- [ ] ${l.replace(/^[-*]\s+/, '')}`))
      .join('\n');
  }

  return `- [ ] ${fallbackTitle}`;
}

/**
 * Pulls live issue acceptance criteria from Linear GraphQL, GitHub Issues REST, or Jira REST.
 */
export async function pullExternalIssueSpec(
  options: PullExternalIssueOptions,
): Promise<PulledIssueSpec> {
  const fetchImpl = options.fetchImpl ?? fetch;

  if (options.source === 'linear') {
    const token = options.token ?? process.env.LINEAR_API_KEY;
    if (!token) {
      throw new Error('LINEAR_API_KEY is required to pull Linear issues.');
    }
    const res = await fetchImpl('https://api.linear.app/graphql', {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify({
        query: `query($id: String!) { issue(id: $id) { identifier title description } }`,
        variables: { id: options.externalId },
      }),
    });
    if (!res.ok) {
      throw new Error(`Linear API error: ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: { issue?: { identifier?: string; title?: string; description?: string } };
    };
    const issue = json.data?.issue;
    if (!issue?.title) {
      throw new Error(`Linear issue not found: ${options.externalId}`);
    }
    return {
      externalId: issue.identifier ?? options.externalId,
      source: 'linear',
      repoSlug: options.repoSlug,
      title: issue.title,
      checklistMarkdown: extractChecklistLines(issue.description ?? '', issue.title),
    };
  }

  if (options.source === 'github') {
    const safeRepo = validateRepoSlug(options.repoSlug);
    const issueNum = Number(options.externalId.replace(/^#/, ''));
    if (!Number.isInteger(issueNum) || issueNum <= 0) {
      throw new Error(`Invalid GitHub issue number: ${options.externalId}`);
    }
    const token = options.token ?? process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetchImpl(`https://api.github.com/repos/${safeRepo}/issues/${issueNum}`, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
      headers,
    });
    if (!res.ok) {
      throw new Error(`GitHub Issues API error: ${res.status}`);
    }
    const issue = (await res.json()) as { number?: number; title?: string; body?: string };
    if (!issue.title) {
      throw new Error(`GitHub issue not found: #${issueNum}`);
    }
    return {
      externalId: `#${issue.number ?? issueNum}`,
      source: 'github',
      repoSlug: safeRepo,
      title: issue.title,
      checklistMarkdown: extractChecklistLines(issue.body ?? '', issue.title),
    };
  }

  const baseRaw = options.jiraBaseUrl ?? process.env.JIRA_BASE_URL;
  const auth = options.token ?? process.env.JIRA_AUTH_HEADER;
  if (!baseRaw || !auth) {
    throw new Error('JIRA_BASE_URL and JIRA_AUTH_HEADER are required to pull Jira issues.');
  }
  const baseUrl = validateHttpUrl(baseRaw, true).toString().replace(/\/$/, '');
  const key = options.externalId.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]+-\d+$/.test(key)) {
    throw new Error(`Invalid Jira issue key: ${options.externalId}`);
  }
  const res = await fetchImpl(`${baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}`, {
    method: 'GET',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Accept: 'application/json',
      Authorization: auth,
    },
  });
  if (!res.ok) {
    throw new Error(`Jira API error: ${res.status}`);
  }
  const issue = (await res.json()) as {
    key?: string;
    fields?: { summary?: string; description?: unknown };
  };
  const title = issue.fields?.summary;
  if (!title) {
    throw new Error(`Jira issue not found: ${key}`);
  }
  const desc = typeof issue.fields?.description === 'string' ? issue.fields.description : '';
  return {
    externalId: issue.key ?? key,
    source: 'jira',
    repoSlug: options.repoSlug,
    title,
    checklistMarkdown: extractChecklistLines(desc, title),
  };
}
