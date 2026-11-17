---
name: specproof
description: Execution-backed diff-scoped test integrity, micro-mutation, and spec-to-PR verification gate for TypeScript, JavaScript, Python, and Go. Use whenever verifying AI-generated code or unit tests, auditing PR diffs for vacuous assertions, empty/skipped tests, or mock abuse, proving boundary/edge-case test strength with mutation testing, checking acceptance criteria in SPEC.md, or configuring the SpecProof CLI, GitHub Action, or MCP server.
license: Apache-2.0
compatibility: Node.js >=22.13.0 and git (for diff scoping). Works with Cursor, Claude Code, Antigravity, GitHub Actions, and local CLI workflows.
metadata:
  author: Claw2M
  version: "0.2.0"
  repository: "https://github.com/Claw2M/specproof-"
---

# SpecProof Verification Gate

Verify code and test changes with deterministic AST analysis, diff-scoped micro-mutation, and spec-to-PR coverage mapping rather than heuristic diff guesses.

## Capabilities

1. **Test Integrity Gate (TS/JS, Python & Go):** Flags vacuous assertions (`expect(true).toBe(true)`, `assert True`), empty tests, skipped tests, excessive mocking relative to real assertions, and swallowed `catch` / `except` blocks.
2. **Diff-Scoped Micro-Mutation (TS/JS, Python & Go):** Mutates only changed source lines inside isolated temporary sandboxes and re-runs the project's test command to catch fake tests and missing boundary assertions (such as `>=` vs `>`).
3. **Spec-to-PR Coverage Mapping:** Matches `SPEC.md` or inline markdown checklists against changed files, symbols, and tests (deterministically, or via optional BYOK OpenAI / Anthropic / Gemini evaluation).

## How to Run SpecProof

Choose whichever integration is available in the current environment:

### Option A — Via SpecProof MCP Server (Preferred for Coding Agents)
If the `specproof` MCP server is connected, call its tools directly before declaring any coding task complete:
1. `check_test_integrity` (`repoRoot`, optional `baseRef` or `allFiles`)
2. `run_diff_mutation` (`repoRoot`, optional `baseRef`, `testCommand`, `failUnderScore`, `allFiles`)
3. `verify_spec_coverage` (`repoRoot`, `specPath` or `specMarkdown`, optional `baseRef`, `useLlm`, `provider`)

See `references/cli-and-mcp.md` for MCP client configuration (`specproof mcp` / `specproof-mcp`).

### Option B — Via CLI
If running from the terminal:
```bash
# If installed globally or via npx (@specproof/cli)
npx @specproof/cli init
npx @specproof/cli check --base origin/main --mutate --fail-under 70

# Or from a local SpecProof monorepo build
node /path/to/specproof/packages/cli/dist/index.js check --all --mutate
```

## Standard Verification Workflow

Follow this order on every feature or bugfix change:

1. **Ensure configuration exists:** Check for `.specproof.json` in the repository root. If missing and custom thresholds or test commands are needed, copy or adapt `assets/specproof.config.example.json` (or run `specproof init`).
2. **Run Test Integrity Check first (`check_test_integrity` or `specproof check`):**
   - Fix any `vacuous-assertion`, `empty-test`, `skipped-test`, or swallowed error findings immediately.
   - If `mock-abuse` warnings appear, replace excessive mocks on the behavior under test with real execution assertions.
3. **Prove boundary strength (`run_diff_mutation` or `specproof check --mutate --fail-under 75`):**
   - Inspect every **survived** mutant (line number, original operator/condition vs mutated form).
   - Add targeted unit test assertions that cover exact boundary conditions (e.g., `n === limit`, `n === limit - 1`, `n === limit + 1`) rather than weakening `--fail-under`.
   - Note: Timed-out mutants indicate an infinite loop risk or insufficient timeout (`mutationTimeoutMs`) and are reported separately rather than counted as killed or survived.
4. **Verify Spec Coverage (`verify_spec_coverage` or `specproof check --spec SPEC.md`):**
   - Check that every checklist requirement in `SPEC.md` maps to changed code and real tests.
   - Add `--require-spec-match` to fail CI if any acceptance criterion remains uncovered.

## References & Assets

- Read `references/cli-and-mcp.md` when setting up MCP servers, GitHub Actions (`Claw2M/specproof-@main`), BYOK LLM keys, or CI environment variables.
- Use `assets/specproof.config.example.json` as a clean `.specproof.json` starter template.
