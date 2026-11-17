# @specproof/cli

**Diff-scoped test integrity, micro-mutation, and spec-to-PR verification gate for AI-assisted engineering teams.**

Supports **TypeScript / JavaScript**, **Python**, and **Go** with deterministic AST integrity rules, isolated sandbox micro-mutation testing, `SPEC.md` acceptance-criteria mapping, GitHub PR comments / Check Runs, and a built-in stdio MCP server.

Requires **Node.js `>=22.13.0`**.

## Quickstart

```bash
# Initialize .specproof.json in your repository
npx @specproof/cli init

# Scan test integrity across your repository
npx @specproof/cli check --all

# Run diff-scoped micro-mutation against main with a 75% threshold
npx @specproof/cli check --base origin/main --mutate --fail-under 75

# Verify PR diff against SPEC.md requirements
npx @specproof/cli check --base origin/main --spec SPEC.md --require-spec-match
```

## MCP Server (Cursor / Claude Code / Antigravity)

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

Exposed MCP tools:
- `check_test_integrity`
- `run_diff_mutation`
- `verify_spec_coverage`

Repository & full docs: https://github.com/Claw2M/specproof
