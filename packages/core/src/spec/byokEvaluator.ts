import type {
  FileDiff,
  LlmProvider,
  MutationSummary,
  SpecCoverageSummary,
  SpecRequirement,
} from '../types.js';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface ByokEvaluatorOptions {
  provider?: LlmProvider;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

interface LlmAssessmentItem {
  id: string;
  verdict: 'covered' | 'partial' | 'missing';
  reason: string;
}

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  gemini: 'gemini-2.5-flash',
};

const VALID_VERDICTS = new Set(['covered', 'partial', 'missing']);

/**
 * Resolves the BYOK LLM provider and API key from explicit options or environment variables.
 */
export function resolveByokCredentials(
  options: ByokEvaluatorOptions = {},
): { provider: LlmProvider; apiKey: string; model: string } | null {
  const explicitProvider =
    options.provider ??
    (process.env.SPECPROOF_LLM_PROVIDER as LlmProvider | undefined);

  const keyByProvider: Record<LlmProvider, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };

  if (explicitProvider !== undefined) {
    if (!DEFAULT_MODELS[explicitProvider]) {
      throw new Error(
        `Unsupported LLM provider "${String(explicitProvider)}". Expected openai, anthropic, or gemini.`,
      );
    }
    const key = options.apiKey ?? process.env.SPECPROOF_API_KEY ?? keyByProvider[explicitProvider];
    if (!key) {
      return null;
    }
    return {
      provider: explicitProvider,
      apiKey: key,
      model: options.model ?? process.env.SPECPROOF_LLM_MODEL ?? DEFAULT_MODELS[explicitProvider],
    };
  }

  for (const candidate of ['openai', 'anthropic', 'gemini'] as const) {
    const key = keyByProvider[candidate];
    if (key) {
      return {
        provider: candidate,
        apiKey: key,
        model: options.model ?? process.env.SPECPROOF_LLM_MODEL ?? DEFAULT_MODELS[candidate],
      };
    }
  }

  return null;
}

function buildEvaluationPrompt(
  coverage: SpecCoverageSummary,
  diffFiles: FileDiff[],
  mutation?: MutationSummary,
): string {
  const reqList = coverage.requirements
    .map((r) => `- ${r.id}: ${r.text}`)
    .join('\n');

  const diffSummary = diffFiles
    .slice(0, 25)
    .map((f) => `### ${f.path} (${f.status})\n${f.addedLines.slice(0, 40).join('\n')}`)
    .join('\n\n');

  const mutationNote = mutation
    ? `Diff Mutation Score: ${mutation.score.toFixed(1)}% (${mutation.killed} killed, ${mutation.survived} survived).`
    : 'Mutation testing not run.';

  return [
    'Evaluate whether the following code changes and tests satisfy each requirement.',
    'Return strict JSON with shape: {"items":[{"id":"REQ-1","verdict":"covered|partial|missing","reason":"short explanation"}]}',
    '',
    'Requirements:',
    reqList,
    '',
    mutationNote,
    '',
    'Changed code & test snippets:',
    diffSummary,
  ].join('\n');
}

async function invokeLlm(
  creds: { provider: LlmProvider; apiKey: string; model: string },
  prompt: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<string> {
  const signal = AbortSignal.timeout(timeoutMs);

  if (creds.provider === 'openai') {
    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.apiKey}`,
      },
      body: JSON.stringify({
        model: creds.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a strict software verification auditor.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content ?? '{}';
  }

  if (creds.provider === 'anthropic') {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': creds.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: creds.model,
        max_tokens: 1024,
        temperature: 0,
        system: 'You are a strict software verification auditor. Respond with JSON only.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      content?: Array<{ text?: string }>;
    };
    return json.content?.[0]?.text ?? '{}';
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(creds.model)}:generateContent`;
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': creds.apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
}

function parseAssessmentJson(rawText: string): LlmAssessmentItem[] {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Invalid JSON returned by LLM evaluator: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { items?: unknown }).items)) {
    return [];
  }

  const rawItems = (parsed as { items: unknown[] }).items;
  const validated: LlmAssessmentItem[] = [];
  for (const item of rawItems) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const rec = item as Record<string, unknown>;
    if (
      typeof rec.id === 'string' &&
      typeof rec.verdict === 'string' &&
      VALID_VERDICTS.has(rec.verdict) &&
      typeof rec.reason === 'string'
    ) {
      validated.push({
        id: rec.id,
        verdict: rec.verdict as LlmAssessmentItem['verdict'],
        reason: rec.reason,
      });
    }
  }
  return validated;
}

/**
 * Enriches deterministic spec coverage with semantic BYOK LLM evaluation when credentials exist.
 */
export async function evaluateSpecWithByokLlm(
  coverage: SpecCoverageSummary,
  diffFiles: FileDiff[],
  mutation?: MutationSummary,
  options: ByokEvaluatorOptions = {},
): Promise<SpecCoverageSummary> {
  if (coverage.requirements.length === 0) {
    return coverage;
  }

  const creds = resolveByokCredentials(options);
  if (!creds) {
    return coverage;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const prompt = buildEvaluationPrompt(coverage, diffFiles, mutation);
  const raw = await invokeLlm(creds, prompt, fetchImpl, timeoutMs);
  const items = parseAssessmentJson(raw);
  const byId = new Map(items.map((item) => [item.id, item]));

  const updated: SpecRequirement[] = coverage.requirements.map((req) => {
    const hit = byId.get(req.id);
    if (!hit) {
      return req;
    }
    return {
      ...req,
      covered: hit.verdict === 'covered',
      llmVerdict: hit.verdict,
      llmReason: hit.reason,
    };
  });

  const coveredCount = updated.filter((r) => r.covered).length;
  return {
    ...coverage,
    coveredCount,
    coverageRatio: updated.length === 0 ? 1 : coveredCount / updated.length,
    evaluatedBy: creds.provider,
    requirements: updated,
  };
}
