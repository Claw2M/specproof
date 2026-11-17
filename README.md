# SpecProof

**Open-core diff-scoped test integrity, micro-mutation, and spec-to-PR verification gate for AI-assisted engineering teams.**

AI coding agents (Cursor, Claude Code, Copilot, Devin) make generating code and unit tests trivial—but verification has become the bottleneck. Teams face **mock abuse**, **vacuous assertions** (`expect(true).toBe(true)`), **untested boundary conditions**, and **missing acceptance criteria**, while existing AI reviewers charge steep per-seat + overage fees for noisy diff comments.

SpecProof closes that gap with execution-backed proof instead of guesswork:

1. **Zero-LLM AST Test Integrity Gate (TS/JS, Python & Go):** Detects vacuous assertions, empty tests, skipped tests, excessive mocking vs. real assertions, and swallowed `catch`/`except` blocks.
2. **Diff-Scoped Micro-Mutation Engine (TS/JS, Python & Go):** Mutates *only* changed lines in your PR inside isolated parallel sandboxes (`runDiffMutationsAsync`) and runs your test suite in seconds—catching fake AI tests and missing edge cases (like `>=` vs `>`).
3. **Spec-to-PR Coverage Mapping (+ Optional BYOK LLM & Live Issue Pull):** Matches `SPEC.md` / checklist acceptance criteria against changed symbols and tests deterministically, or semantically via your own OpenAI / Anthropic / Gemini API key, and pulls issues from Linear / GitHub / Jira (`POST /api/specs/pull`).
4. **Native MCP Server + CLI + GitHub Action & Check Runs:** Works inside **Cursor / Claude Code** via MCP (`check_test_integrity`, `run_diff_mutation`, `verify_spec_coverage`) *before* a PR is opened, posts sticky GitHub PR comments, and publishes GitHub Check Run inline annotations (`--post-check-run`).

---

## Architecture

```text
specproof/
├── packages/
│   ├── core/        # Unified git diff parser, TS/JS, Python & Go integrity, Check Runs, BYOK LLM, PR bot, cloud uploader
│   ├── mutator/     # Diff-scoped TS/JS, Python & Go micro-mutant generator & parallel isolated sandbox runner
│   ├── mcp-server/  # Model Context Protocol (MCP) stdio server for coding agents
│   └── cli/         # `specproof` CLI (`init`, `check`, `mcp`)
└── apps/
    └── web/         # Open-Core Commercial Team Cloud Dashboard (Node SQLite + REST + Webhook + Issue Pull + SSR UI)
```

---

## Quickstart

```bash
npm install
npm run verify
```

Initialize `.specproof.json` in any repository:

```bash
node packages/cli/dist/index.js init
```

Run integrity + diff-scoped mutation + BYOK spec checks on your current branch:

```bash
node packages/cli/dist/index.js check --all
node packages/cli/dist/index.js check --base main --mutate --fail-under 75
OPENAI_API_KEY=... node packages/cli/dist/index.js check --base main --spec SPEC.md --llm
```

### CLI Flags & Environment Variables

* **Check flags:** `--repo <path>`, `--base <ref>`, `--all`, `--mutate`, `--test-cmd <cmd>`, `--fail-under <0-100>`, `--spec <path>`, `--llm`, `--provider <openai|anthropic|gemini>`, `--model <name>`, `--post-pr-comment`, `--post-check-run`, `--sha <commit-sha>`, `--cloud <url>`, `--upload <url>`, `--strict`, `--require-spec-match`, `--config <path>`, `--branch <name>`, `--repo-slug <owner/repo>`, `--pr <number>`, `--json`, `--markdown`.
* **Environment variables:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `SPECPROOF_API_KEY`, `SPECPROOF_LLM_PROVIDER`, `SPECPROOF_LLM_MODEL`, `GITHUB_TOKEN`, `SPECPROOF_CLOUD_TOKEN`, `SPECPROOF_GITHUB_WEBHOOK_SECRET`, `LINEAR_API_KEY`, `JIRA_BASE_URL`, `JIRA_API_TOKEN`, `JIRA_EMAIL`, `PORT`, `SPECPROOF_DB_PATH`.
* **Runtime requirement:** Node.js `>=22.13.0` (`node:sqlite` for `@specproof/cloud`).

---

## GitHub Action (`action.yml`)

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: Claw2M/specproof@main
  with:
    base-ref: origin/${{ github.base_ref }}
    mutate: 'true'
    fail-under: '70'
    spec: SPEC.md
    post-pr-comment: 'true'
```

---

## MCP Integration (Cursor / Claude Code)

Add SpecProof as a local MCP server so your coding agent must verify test integrity and mutations before finishing a task:

```json
{
  "mcpServers": {
    "specproof": {
      "command": "node",
      "args": ["/absolute/path/to/specproof/packages/cli/dist/index.js", "mcp"]
    }
  }
}
```

Available MCP tools:
- `check_test_integrity`
- `run_diff_mutation`
- `verify_spec_coverage`

---

## Open-Core Roadmap

- **OSS Core (Apache-2.0):** Local CLI, MCP server, TS/JS & Python AST integrity rules, diff-scoped micro-mutation, GitHub Action markdown/JSON reports.
- **Team Cloud (`apps/web`):** Multi-repo PR evidence dashboard, Linear/Jira/GitHub spec sync, org-wide policy enforcement, unlimited-seat flat pricing. Start locally with:

```bash
npm run build
node apps/web/dist/bin.js --demo
# Pull org policies & synced Linear/Jira specs, verify diff, and upload proof:
node packages/cli/dist/index.js check --all --cloud http://localhost:4310
```

Or run self-hosted Enterprise Cloud via Docker:

```bash
docker compose up -d
```
