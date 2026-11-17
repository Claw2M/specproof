# SpecProof

[![npm version](https://img.shields.io/npm/v/@specproof/cli?color=22c55e&label=npm%20%40specproof%2Fcli)](https://www.npmjs.com/package/@specproof/cli)
[![SpecProof CI](https://github.com/Claw2M/specproof/actions/workflows/ci.yml/badge.svg)](https://github.com/Claw2M/specproof/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-0099ff.svg)](./LICENSE)
[![Node.js >=22.13](https://img.shields.io/badge/node-%3E%3D22.13.0-5FA04E)](https://nodejs.org/)

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

Zero-install CLI via [`@specproof/cli`](https://www.npmjs.com/package/@specproof/cli) (Node.js `>=22.13.0`):

```bash
# Initialize .specproof.json and print Cursor / Claude Code MCP config
npx -y @specproof/cli init

# Scan test integrity across your repository
npx -y @specproof/cli check --all

# Run diff-scoped micro-mutation testing against main (0-100 threshold)
npx -y @specproof/cli check --base origin/main --mutate --fail-under 75

# Verify acceptance criteria in SPEC.md (optionally with BYOK LLM)
OPENAI_API_KEY=... npx -y @specproof/cli check --base main --spec SPEC.md --llm
```

Or install globally:

```bash
npm install -g @specproof/cli
specproof check --all --mutate
```

<details>
<summary>Local Monorepo Development Setup (Contributors)</summary>

```bash
git clone https://github.com/Claw2M/specproof.git
cd specproof
npm install
npm run verify
node packages/cli/dist/index.js check --all --spec SPEC.md
```

</details>

### CLI Flags & Environment Variables

* **Check flags:** `--repo <path>`, `--config <path>`, `--base <ref>`, `--all`, `--mutate`, `--test-cmd <cmd>`, `--fail-under <0-100>`, `--spec <path>`, `--llm`, `--provider <openai|anthropic|gemini>`, `--model <name>`, `--post-pr-comment`, `--post-check-run`, `--sha <commit-sha>`, `--cloud <url>`, `--upload <url>`, `--strict`, `--require-spec-match`, `--branch <name>`, `--repo-slug <owner/repo>`, `--pr <number>`, `--json`, `--markdown`.
* **Environment variables:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `SPECPROOF_API_KEY`, `SPECPROOF_LLM_PROVIDER`, `SPECPROOF_LLM_MODEL`, `GITHUB_TOKEN`, `SPECPROOF_CLOUD_TOKEN`, `SPECPROOF_GITHUB_WEBHOOK_SECRET`, `SPECPROOF_ENFORCE_PLANS`, `SPECPROOF_LEMONSQUEEZY_WEBHOOK_SECRET`, `SPECPROOF_CHECKOUT_URL`, `LINEAR_API_KEY`, `JIRA_BASE_URL`, `JIRA_API_TOKEN`, `JIRA_EMAIL`, `PORT`, `SPECPROOF_DB_PATH`.
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

## MCP Integration (Cursor / Claude Code / Antigravity)

Add SpecProof as an MCP server so your coding agent verifies test integrity and mutations before finishing a task:

```json
{
  "mcpServers": {
    "specproof": {
      "command": "npx",
      "args": ["-y", "@specproof/cli", "mcp"]
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

- **OSS Core (Apache-2.0):** Local CLI (`npx @specproof/cli`), MCP server, TS/JS, Python & Go AST integrity rules, diff-scoped micro-mutation, GitHub Action markdown/JSON reports & Check Runs.
- **Team Cloud (`apps/web`):** Multi-repo PR evidence dashboard, Linear/Jira/GitHub spec sync, org-wide policy enforcement, Lemon Squeezy billing & plan limits, unlimited-seat flat pricing. Start locally with:

```bash
npm run build
node apps/web/dist/bin.js --demo
# Pull org policies & synced Linear/Jira specs, verify diff, and upload proof:
npx -y @specproof/cli check --all --cloud http://localhost:4310
```

Or run self-hosted Enterprise Cloud via Docker:

```bash
docker compose up -d
```
