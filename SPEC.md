# SpecProof v0.2 Specification

## Core Verification Capabilities
- [ ] AC-1: Parse unified git diffs and extract added line ranges via parseUnifiedDiff and getGitDiff
- [ ] AC-2: Detect AI test anti-patterns (vacuous-assertion, empty-test, skipped-test, mock-abuse, swallowed-error) in TS/JS via analyzeFilesIntegrity
- [ ] AC-3: Detect Python test integrity issues and swallowed exceptions via analyzePythonTestFile and analyzePythonSourceFile
- [ ] AC-4: Generate diff-scoped micro-mutants for TS/JS and Python via generateDiffMutants and collectPythonMutants
- [ ] AC-5: Execute mutants safely in an isolated sandbox via runDiffMutations without mutating the working tree
- [ ] AC-6: Evaluate SPEC.md acceptance criteria deterministically and via BYOK LLM (evaluateSpecCoverage, evaluateSpecWithByokLlm)
- [ ] AC-7: Post or update sticky GitHub PR comments via postOrUpdatePrComment
- [ ] AC-8: Sync org policies/specs and upload verification runs to Team Cloud (CloudStore, createCloudServer, uploadVerificationReport, fetchCloudPolicyAndSpecs)
- [ ] AC-9: Detect Go test integrity issues and generate Go micro-mutants via analyzeGoTestFile and collectGoMutants
- [ ] AC-10: Run diff mutations concurrently across worker sandboxes via runDiffMutationsAsync
- [ ] AC-11: Publish GitHub Check Run annotations, verify webhook HMAC signatures, and pull external Linear/GitHub/Jira issues via publishGitHubCheckRun, verifyGitHubWebhookSignature, and pullExternalIssueSpec
