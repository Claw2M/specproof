---
name: specproof-pro
description: Enterprise & team rollout kit for SpecProof. Use when setting up multi-repo PR verification gates, strict zero-tolerance AI code policies, language-specific GitHub Actions workflows (TS/JS monorepo, Python pytest, Go test), or self-hosting SpecProof Team Cloud with Docker, TLS, Lemon Squeezy billing webhooks, and Linear/Jira/GitHub issue sync.
license: Apache-2.0
compatibility: Node.js >=22.13.0, GitHub Actions, Docker Compose (for Team Cloud self-hosting).
metadata:
  author: Claw2M
  version: "0.2.0"
  tier: "pro-pack"
  repository: "https://github.com/Claw2M/specproof-"
---

# SpecProof Pro Pack — Team Rollout & Self-Hosted Cloud Kit

Production templates and strict guardrails for engineering teams rolling out SpecProof across multiple repositories, CI pipelines, and self-hosted Team Cloud instances.

## Included Assets

1. **Policy Presets (`assets/presets/`):**
   - `strict-ai-gate.specproof.json` — High-bar preset (`failUnderMutationScore: 85`, `blockOnMockAbuse: true`, `blockOnVacuous: true`, `requireSpecMatch: true`, `mockToAssertionMaxRatio: 1.5`).
   - `balanced-startup.specproof.json` — Fast PR gate preset (`failUnderMutationScore: 70`, `blockOnVacuous: true`, `mutationTimeoutMs: 10000`).
2. **GitHub Actions Workflows (`assets/workflows/`):**
   - `ts-monorepo-pr-gate.yml` — Node 22 + Vitest/Jest PR gate with Check Run inline annotations and sticky PR comments.
   - `python-pytest-pr-gate.yml` — Python + pytest PR gate with diff-scoped AST & mutation checks.
   - `go-test-pr-gate.yml` — Go module PR gate with `go test ./...` mutation runner.
3. **Self-Hosted Team Cloud Ops (`references/team-cloud-selfhost.md`):**
   - Docker Compose production checklist, Caddy/Nginx TLS reverse proxy, API token & webhook HMAC secret rotation, Linear/Jira sync, and Lemon Squeezy billing webhook wiring.

## Rollout Playbook

1. **Choose the Repository Policy Preset:**
   - Copy either `assets/presets/strict-ai-gate.specproof.json` or `assets/presets/balanced-startup.specproof.json` to `.specproof.json` in the target repo.
   - Adjust `testCommand` (`npm test`, `pytest -q`, or `go test ./...`) to run only fast unit/integration tests suitable for per-mutant sandboxes.
2. **Install the Language-Specific PR Workflow:**
   - Copy the matching workflow from `assets/workflows/` into `.github/workflows/specproof.yml`.
   - Ensure `permissions` include `contents: read`, `pull-requests: write`, and `checks: write`.
3. **Connect Team Cloud & Spec Sync (Optional Centralized Control Plane):**
   - Follow `references/team-cloud-selfhost.md` to launch `apps/web` behind TLS, set `SPECPROOF_CLOUD_TOKEN`, and pass `cloud: https://your-cloud.example.com` in the GitHub Action so repos inherit org policies and synced Linear/Jira/GitHub specs.
4. **Enforce Agent-Side Pre-Flight Checks:**
   - Configure Cursor / Claude Code / Antigravity to run `check_test_integrity` and `run_diff_mutation` via `@specproof/mcp-server` before committing or opening a PR.
