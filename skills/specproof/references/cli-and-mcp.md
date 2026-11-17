# SpecProof CLI, MCP & GitHub Action Reference

## MCP Server Configuration

Add SpecProof as an MCP stdio server in Cursor, Claude Code, or Antigravity:

```json
{
  "mcpServers": {
    "specproof": {
      "command": "npx",
      "args": ["-y", "-p", "@specproof/cli", "specproof", "mcp"]
    }
  }
}
```

Or point directly to a local build:

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

### Exposed MCP Tools

| Tool | Purpose | Key Arguments |
| --- | --- | --- |
| `check_test_integrity` | AST check for vacuous assertions, empty/skipped tests, mock abuse | `repoRoot`, `baseRef?`, `allFiles?` |
| `run_diff_mutation` | Isolated diff-scoped micro-mutation run | `repoRoot`, `baseRef?`, `testCommand?`, `failUnderScore?`, `allFiles?` |
| `verify_spec_coverage` | Check `SPEC.md` or inline checklist against diff | `repoRoot`, `specPath?`, `specMarkdown?`, `baseRef?`, `useLlm?`, `provider?` |

## CLI Reference

```bash
specproof init
specproof check [options]
specproof mcp
```

Common flags for `specproof check`:
- `--repo <path>` — Repository root (defaults to current working directory)
- `--config <path>` — Custom config file path relative to `--repo`
- `--base <git-ref>` — Git base ref for diff scoping (e.g. `origin/main`)
- `--all` — Scan all supported source/test files instead of only git diff
- `--mutate` — Run diff-scoped micro-mutation testing in parallel isolated sandboxes
- `--test-cmd <cmd>` — Override test command (defaults to `.specproof.json` or `npm test`)
- `--fail-under <0-100>` — Fail if mutation score is below threshold
- `--strict` — Treat mock-abuse warnings as failures
- `--require-spec-match` — Fail if any acceptance criterion in `--spec` is uncovered
- `--spec <path>` — Path to markdown specification file (e.g. `SPEC.md`)
- `--llm` — Enable optional BYOK semantic spec verification
- `--provider <openai|anthropic|gemini>` / `--model <name>` — Override LLM provider/model
- `--post-pr-comment` — Post or update sticky GitHub PR summary (`GITHUB_TOKEN`)
- `--post-check-run` / `--sha <sha>` — Publish GitHub Check Run with inline annotations
- `--json` / `--markdown` — Machine-readable JSON or PR markdown report

## GitHub Actions Setup

```yaml
name: SpecProof Gate
on: [pull_request]

jobs:
  specproof:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      checks: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: Claw2M/specproof-@main
        with:
          base-ref: origin/${{ github.base_ref }}
          mutate: 'true'
          fail-under: '70'
          spec: SPEC.md
          post-pr-comment: 'true'
          post-check-run: 'true'
```

## Supported Environment Variables

- BYOK LLM: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `SPECPROOF_API_KEY`, `SPECPROOF_LLM_PROVIDER`, `SPECPROOF_LLM_MODEL`
- GitHub & Cloud: `GITHUB_TOKEN`, `SPECPROOF_CLOUD_TOKEN`, `SPECPROOF_GITHUB_WEBHOOK_SECRET`
- Issue Trackers (Team Cloud): `LINEAR_API_KEY`, `JIRA_BASE_URL`, `JIRA_API_TOKEN`, `JIRA_EMAIL`
