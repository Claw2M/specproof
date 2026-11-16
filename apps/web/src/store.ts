import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { VerificationReport } from '@specproof/core';

export interface RunSummary {
  id: string;
  repoSlug: string;
  branch: string;
  prNumber: number | null;
  passed: boolean;
  diffFilesCount: number;
  integrityFindingsCount: number;
  mutationScore: number | null;
  specCoverageRatio: number | null;
  evaluatedBy: string;
  createdAt: string;
}

export interface StoredRun extends RunSummary {
  reportJson: VerificationReport;
}

export interface OrgPolicy {
  minMutationScore: number;
  blockOnMockAbuse: boolean;
  blockOnVacuous: boolean;
  requireSpecMatch: boolean;
  updatedAt: string;
}

export interface SyncedSpec {
  id: string;
  externalId: string;
  source: 'linear' | 'jira' | 'github' | 'manual';
  repoSlug: string;
  title: string;
  checklistMarkdown: string;
  updatedAt: string;
}

export interface CloudStats {
  totalRuns: number;
  passedRuns: number;
  passRate: number;
  avgMutationScore: number | null;
  totalIntegrityFindings: number;
}

export interface RepoTrendPoint {
  repoSlug: string;
  runs: number;
  passRate: number;
  avgMutationScore: number | null;
  findings: number;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  targetId: string;
  detail: string;
  createdAt: string;
}

function safeParseReportJson(raw: string): VerificationReport {
  try {
    return JSON.parse(raw) as VerificationReport;
  } catch {
    return {
      timestamp: new Date(0).toISOString(),
      repoRoot: 'corrupted-record',
      diffFiles: [],
      integrity: {
        filesScanned: 0,
        testFilesScanned: 0,
        totalTests: 0,
        totalAssertions: 0,
        totalMocks: 0,
        findings: [],
        fileMetrics: [],
      },
      passed: false,
      failureReasons: ['Stored report JSON could not be parsed.'],
    };
  }
}

function crossPlatformBasename(rawPath: string): string {
  const parts = rawPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? 'local-repo';
}

function normalizeIsoTimestamp(raw?: string): string {
  if (!raw) {
    return new Date().toISOString();
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
}

function csvEscape(val: unknown): string {
  const str = String(val ?? '');
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * SQLite-backed persistence layer for SpecProof Team Cloud (runs, policies, specs, and audit logs).
 */
export class CloudStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    if (dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    }
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS verification_runs (
        id TEXT PRIMARY KEY,
        repo_slug TEXT NOT NULL,
        branch TEXT NOT NULL,
        pr_number INTEGER,
        passed INTEGER NOT NULL,
        diff_files_count INTEGER NOT NULL,
        integrity_findings_count INTEGER NOT NULL,
        mutation_score REAL,
        spec_coverage_ratio REAL,
        evaluated_by TEXT NOT NULL,
        report_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_runs_created ON verification_runs (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_runs_repo ON verification_runs (repo_slug);
      CREATE INDEX IF NOT EXISTS idx_runs_passed ON verification_runs (passed);

      CREATE TABLE IF NOT EXISTS org_policies (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        min_mutation_score REAL NOT NULL,
        block_on_mock_abuse INTEGER NOT NULL,
        block_on_vacuous INTEGER NOT NULL,
        require_spec_match INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS spec_links (
        id TEXT PRIMARY KEY,
        external_id TEXT NOT NULL,
        source TEXT NOT NULL,
        repo_slug TEXT NOT NULL,
        title TEXT NOT NULL,
        checklist_markdown TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_spec_links_ext_repo
      ON spec_links (external_id, repo_slug);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        target_id TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      PRAGMA user_version = 1;
    `);

    const existing = this.db.prepare('SELECT id FROM org_policies WHERE id = 1').get();
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO org_policies (id, min_mutation_score, block_on_mock_abuse, block_on_vacuous, require_spec_match, updated_at)
           VALUES (1, 70, 1, 1, 0, ?)`,
        )
        .run(new Date().toISOString());
    }
  }

  recordAudit(action: string, targetId: string, detail: string): void {
    this.db
      .prepare(
        `INSERT INTO audit_logs (id, action, target_id, detail, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(crypto.randomUUID(), action, targetId, detail, new Date().toISOString());
  }

  listAuditLogs(limit = 100): AuditLogEntry[] {
    const rows = this.db
      .prepare('SELECT id, action, target_id, detail, created_at FROM audit_logs ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      action: String(r.action),
      targetId: String(r.target_id),
      detail: String(r.detail),
      createdAt: String(r.created_at),
    }));
  }

  insertRun(input: {
    repoSlug?: string;
    branch?: string;
    prNumber?: number;
    report: VerificationReport;
  }): StoredRun {
    const id = crypto.randomUUID();
    const repoSlug = input.repoSlug?.trim() || crossPlatformBasename(input.report.repoRoot);
    const branch = input.branch?.trim() || input.report.baseRef || 'HEAD';
    const prNumber =
      typeof input.prNumber === 'number' && Number.isInteger(input.prNumber) && input.prNumber > 0
        ? input.prNumber
        : null;
    const mutationScore = input.report.mutation ? input.report.mutation.score : null;
    const specCoverageRatio = input.report.specCoverage
      ? input.report.specCoverage.coverageRatio
      : null;
    const evaluatedBy = input.report.specCoverage?.evaluatedBy ?? 'deterministic';
    const createdAt = normalizeIsoTimestamp(input.report.timestamp);

    this.db
      .prepare(
        `INSERT INTO verification_runs (
          id, repo_slug, branch, pr_number, passed, diff_files_count,
          integrity_findings_count, mutation_score, spec_coverage_ratio,
          evaluated_by, report_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        repoSlug,
        branch,
        prNumber,
        input.report.passed ? 1 : 0,
        input.report.diffFiles.length,
        input.report.integrity.findings.length,
        mutationScore,
        specCoverageRatio,
        evaluatedBy,
        JSON.stringify(input.report),
        createdAt,
      );

    this.recordAudit('run_ingested', id, `${repoSlug}@${branch} passed=${input.report.passed}`);

    return {
      id,
      repoSlug,
      branch,
      prNumber,
      passed: input.report.passed,
      diffFilesCount: input.report.diffFiles.length,
      integrityFindingsCount: input.report.integrity.findings.length,
      mutationScore,
      specCoverageRatio,
      evaluatedBy,
      reportJson: input.report,
      createdAt,
    };
  }

  listRunSummaries(options: {
    limit?: number;
    offset?: number;
    repo?: string;
    status?: 'passed' | 'failed';
  } = {}): RunSummary[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (options.repo) {
      clauses.push('LOWER(repo_slug) LIKE ?');
      params.push(`%${options.repo.toLowerCase()}%`);
    }
    if (options.status === 'passed') {
      clauses.push('passed = 1');
    } else if (options.status === 'failed') {
      clauses.push('passed = 0');
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(200, Math.max(1, options.limit ?? 50));
    const offset = Math.max(0, options.offset ?? 0);

    const rows = this.db
      .prepare(
        `SELECT id, repo_slug, branch, pr_number, passed, diff_files_count,
                integrity_findings_count, mutation_score, spec_coverage_ratio,
                evaluated_by, created_at
         FROM verification_runs
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      repoSlug: String(row.repo_slug),
      branch: String(row.branch),
      prNumber: row.pr_number === null ? null : Number(row.pr_number),
      passed: Number(row.passed) === 1,
      diffFilesCount: Number(row.diff_files_count),
      integrityFindingsCount: Number(row.integrity_findings_count),
      mutationScore: row.mutation_score === null ? null : Number(row.mutation_score),
      specCoverageRatio: row.spec_coverage_ratio === null ? null : Number(row.spec_coverage_ratio),
      evaluatedBy: String(row.evaluated_by),
      createdAt: String(row.created_at),
    }));
  }

  listRuns(limit = 50): StoredRun[] {
    const rows = this.db
      .prepare('SELECT * FROM verification_runs ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      repoSlug: String(row.repo_slug),
      branch: String(row.branch),
      prNumber: row.pr_number === null ? null : Number(row.pr_number),
      passed: Number(row.passed) === 1,
      diffFilesCount: Number(row.diff_files_count),
      integrityFindingsCount: Number(row.integrity_findings_count),
      mutationScore: row.mutation_score === null ? null : Number(row.mutation_score),
      specCoverageRatio: row.spec_coverage_ratio === null ? null : Number(row.spec_coverage_ratio),
      evaluatedBy: String(row.evaluated_by),
      reportJson: safeParseReportJson(String(row.report_json)),
      createdAt: String(row.created_at),
    }));
  }

  getRun(id: string): StoredRun | null {
    const row = this.db
      .prepare('SELECT * FROM verification_runs WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      id: String(row.id),
      repoSlug: String(row.repo_slug),
      branch: String(row.branch),
      prNumber: row.pr_number === null ? null : Number(row.pr_number),
      passed: Number(row.passed) === 1,
      diffFilesCount: Number(row.diff_files_count),
      integrityFindingsCount: Number(row.integrity_findings_count),
      mutationScore: row.mutation_score === null ? null : Number(row.mutation_score),
      specCoverageRatio: row.spec_coverage_ratio === null ? null : Number(row.spec_coverage_ratio),
      evaluatedBy: String(row.evaluated_by),
      reportJson: safeParseReportJson(String(row.report_json)),
      createdAt: String(row.created_at),
    };
  }

  deleteRun(id: string): boolean {
    const res = this.db.prepare('DELETE FROM verification_runs WHERE id = ?').run(id);
    const removed = Number(res.changes ?? 0) > 0;
    if (removed) {
      this.recordAudit('run_deleted', id, 'Deleted verification run');
    }
    return removed;
  }

  getStats(): CloudStats {
    const agg = this.db
      .prepare(
        `SELECT
          COUNT(*) AS total_runs,
          COALESCE(SUM(passed), 0) AS passed_runs,
          AVG(mutation_score) AS avg_mutation_score,
          COALESCE(SUM(integrity_findings_count), 0) AS total_findings
        FROM verification_runs`,
      )
      .get() as Record<string, unknown>;

    const totalRuns = Number(agg.total_runs ?? 0);
    const passedRuns = Number(agg.passed_runs ?? 0);
    return {
      totalRuns,
      passedRuns,
      passRate: totalRuns === 0 ? 100 : (passedRuns / totalRuns) * 100,
      avgMutationScore: agg.avg_mutation_score === null ? null : Number(agg.avg_mutation_score),
      totalIntegrityFindings: Number(agg.total_findings ?? 0),
    };
  }

  getTrends(): RepoTrendPoint[] {
    const rows = this.db
      .prepare(
        `SELECT
          repo_slug,
          COUNT(*) AS runs,
          COALESCE(SUM(passed), 0) AS passed_runs,
          AVG(mutation_score) AS avg_mutation_score,
          COALESCE(SUM(integrity_findings_count), 0) AS findings
        FROM verification_runs
        GROUP BY repo_slug
        ORDER BY runs DESC`,
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const runs = Number(row.runs ?? 0);
      const passedRuns = Number(row.passed_runs ?? 0);
      return {
        repoSlug: String(row.repo_slug),
        runs,
        passRate: runs === 0 ? 100 : (passedRuns / runs) * 100,
        avgMutationScore:
          row.avg_mutation_score === null ? null : Number(row.avg_mutation_score),
        findings: Number(row.findings ?? 0),
      };
    });
  }

  exportRunsCsv(): string {
    const rows = this.listRunSummaries({ limit: 200 });
    const header = [
      'id',
      'repo_slug',
      'branch',
      'pr_number',
      'passed',
      'diff_files_count',
      'integrity_findings_count',
      'mutation_score',
      'spec_coverage_ratio',
      'evaluated_by',
      'created_at',
    ].join(',');
    const body = rows.map((r) =>
      [
        r.id,
        r.repoSlug,
        r.branch,
        r.prNumber ?? '',
        r.passed,
        r.diffFilesCount,
        r.integrityFindingsCount,
        r.mutationScore ?? '',
        r.specCoverageRatio ?? '',
        r.evaluatedBy,
        r.createdAt,
      ]
        .map(csvEscape)
        .join(','),
    );
    return [header, ...body].join('\n');
  }

  getPolicy(): OrgPolicy {
    const row = this.db
      .prepare('SELECT * FROM org_policies WHERE id = 1')
      .get() as Record<string, unknown>;
    return {
      minMutationScore: Number(row.min_mutation_score),
      blockOnMockAbuse: Number(row.block_on_mock_abuse) === 1,
      blockOnVacuous: Number(row.block_on_vacuous) === 1,
      requireSpecMatch: Number(row.require_spec_match) === 1,
      updatedAt: String(row.updated_at),
    };
  }

  updatePolicy(patch: Partial<Omit<OrgPolicy, 'updatedAt'>>): OrgPolicy {
    const current = this.getPolicy();
    const next: OrgPolicy = {
      minMutationScore: patch.minMutationScore ?? current.minMutationScore,
      blockOnMockAbuse: patch.blockOnMockAbuse ?? current.blockOnMockAbuse,
      blockOnVacuous: patch.blockOnVacuous ?? current.blockOnVacuous,
      requireSpecMatch: patch.requireSpecMatch ?? current.requireSpecMatch,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        `UPDATE org_policies
         SET min_mutation_score = ?, block_on_mock_abuse = ?, block_on_vacuous = ?, require_spec_match = ?, updated_at = ?
         WHERE id = 1`,
      )
      .run(
        next.minMutationScore,
        next.blockOnMockAbuse ? 1 : 0,
        next.blockOnVacuous ? 1 : 0,
        next.requireSpecMatch ? 1 : 0,
        next.updatedAt,
      );

    this.recordAudit('policy_updated', 'org_policy_1', JSON.stringify(next));
    return next;
  }

  upsertSpec(input: Omit<SyncedSpec, 'id' | 'updatedAt'>): SyncedSpec {
    const id = crypto.randomUUID();
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO spec_links (id, external_id, source, repo_slug, title, checklist_markdown, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(external_id, repo_slug) DO UPDATE SET
           source = excluded.source,
           title = excluded.title,
           checklist_markdown = excluded.checklist_markdown,
           updated_at = excluded.updated_at`,
      )
      .run(
        id,
        input.externalId,
        input.source,
        input.repoSlug,
        input.title,
        input.checklistMarkdown,
        updatedAt,
      );

    const saved = this.db
      .prepare('SELECT id FROM spec_links WHERE external_id = ? AND repo_slug = ?')
      .get(input.externalId, input.repoSlug) as { id: string } | undefined;

    const finalId = saved?.id ?? id;
    this.recordAudit('spec_upserted', finalId, `${input.externalId} (${input.repoSlug})`);
    return { id: finalId, ...input, updatedAt };
  }

  listSpecs(limit = 30, repo?: string): SyncedSpec[] {
    const rows = repo
      ? (this.db
          .prepare('SELECT * FROM spec_links WHERE repo_slug = ? OR repo_slug = \'default\' ORDER BY updated_at DESC LIMIT ?')
          .all(repo, limit) as Array<Record<string, unknown>>)
      : (this.db
          .prepare('SELECT * FROM spec_links ORDER BY updated_at DESC LIMIT ?')
          .all(limit) as Array<Record<string, unknown>>);

    return rows.map((row) => ({
      id: String(row.id),
      externalId: String(row.external_id),
      source: String(row.source) as SyncedSpec['source'],
      repoSlug: String(row.repo_slug),
      title: String(row.title),
      checklistMarkdown: String(row.checklist_markdown),
      updatedAt: String(row.updated_at),
    }));
  }

  deleteSpec(id: string): boolean {
    const res = this.db.prepare('DELETE FROM spec_links WHERE id = ?').run(id);
    const removed = Number(res.changes ?? 0) > 0;
    if (removed) {
      this.recordAudit('spec_deleted', id, 'Deleted synced spec');
    }
    return removed;
  }

  close(): void {
    this.db.close();
  }
}
