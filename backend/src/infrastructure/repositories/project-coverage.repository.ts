import { Injectable } from '@nestjs/common';
import { eq, or, and, isNotNull, ne, inArray } from 'drizzle-orm';

import { ProjectCoverageRepository } from '../../application/ports/projects/project-coverage.repository.js';
import type { ProjectCoverageResult } from '../../application/models/project-coverage.models.js';
import { CoverageHealthStatus, COVERAGE_THRESHOLDS } from '../../domain/enums/knowledge.enums.js';
import { isEligibleFileForCoverage, normalizeCoveragePath } from '../../application/utils/github/coverage-file-filter.utils.js';
import { PostgresDatabase } from '../persistence/database.js';
import { projects, projectFiles, notes, noteLinks } from '../persistence/schema/index.js';

@Injectable()
export class PostgresProjectCoverageRepository extends ProjectCoverageRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async getProjectCoverage(userId: string, projectId: string): Promise<ProjectCoverageResult> {
    const db = this.database.getDb();

    // 1. Resolve project by id or slug using Drizzle ORM
    const [project] = await db
      .select({ id: projects.id, slug: projects.projectSlug })
      .from(projects)
      .where(or(eq(projects.id, projectId), eq(projects.projectSlug, projectId)))
      .limit(1);

    if (!project) {
      throw new Error('project_not_found');
    }

    // 2. Fetch project files using Drizzle ORM
    const fileRows = await db
      .select({ filePath: projectFiles.filePath })
      .from(projectFiles)
      .where(eq(projectFiles.projectId, project.id))
      .orderBy(projectFiles.filePath);

    // 3. Fetch note paths, metadata, and note links for project
    const noteRows = await db
      .select({ path: notes.path, metadata: notes.metadata })
      .from(notes)
      .where(eq(notes.projectId, project.id));

    const noteLinkRows = await db
      .select({ target: noteLinks.target })
      .from(noteLinks)
      .innerJoin(notes, eq(notes.id, noteLinks.noteId))
      .where(
        and(
          eq(notes.projectId, project.id),
          isNotNull(noteLinks.target),
          ne(noteLinks.target, ''),
        ),
      );

    const notePathsSet = new Set<string>();
    for (const row of noteRows) {
      if (row.path && row.path.trim()) {
        notePathsSet.add(normalizeCoveragePath(row.path));
      }
      if (row.metadata && typeof row.metadata === 'object') {
        const meta = row.metadata as Record<string, any>;
        if (meta.filePath && typeof meta.filePath === 'string') {
          notePathsSet.add(normalizeCoveragePath(meta.filePath));
        }
        if (meta.target && typeof meta.target === 'string') {
          notePathsSet.add(normalizeCoveragePath(meta.target));
        }
        if (meta.path && typeof meta.path === 'string') {
          notePathsSet.add(normalizeCoveragePath(meta.path));
        }
      }
    }

    for (const row of noteLinkRows) {
      if (row.target && row.target.trim()) {
        notePathsSet.add(normalizeCoveragePath(row.target));
      }
    }

    const allFiles: string[] = fileRows
      .map((r) => r.filePath)
      .filter((fp) => isEligibleFileForCoverage(fp));

    const totalFiles = allFiles.length;
    let coveredCount = 0;
    const uncoveredFiles: string[] = [];

    const folderStatsMap = new Map<string, { total: number; covered: number }>();

    for (const filePath of allFiles) {
      const normalized = normalizeCoveragePath(filePath);
      const isCovered = notePathsSet.has(normalized);

      if (isCovered) {
        coveredCount++;
      } else {
        uncoveredFiles.push(filePath);
      }

      const parts = filePath.split('/');
      const folderPath = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join('/') : 'root';
      const folderStat = folderStatsMap.get(folderPath) || { total: 0, covered: 0 };
      folderStat.total++;
      if (isCovered) folderStat.covered++;
      folderStatsMap.set(folderPath, folderStat);
    }

    const coveragePercentage = totalFiles > 0 ? Number(((coveredCount / totalFiles) * 100).toFixed(1)) : 100;
    const healthStatus: CoverageHealthStatus =
      coveragePercentage >= COVERAGE_THRESHOLDS.HIGH
        ? CoverageHealthStatus.High
        : coveragePercentage >= COVERAGE_THRESHOLDS.MODERATE
        ? CoverageHealthStatus.Moderate
        : CoverageHealthStatus.Low;

    const folderBreakdown = Array.from(folderStatsMap.entries())
      .map(([folderPath, stat]) => ({
        folderPath,
        totalFiles: stat.total,
        coveredFiles: stat.covered,
        percentage: Number(((stat.covered / stat.total) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.totalFiles - a.totalFiles)
      .slice(0, 10);

    const uncoveredTopFiles = uncoveredFiles.slice(0, 10).map((p) => ({ path: p }));

    return {
      projectId: project.id,
      projectSlug: project.slug,
      coveragePercentage,
      totalFiles,
      coveredFiles: coveredCount,
      uncoveredFiles: totalFiles - coveredCount,
      healthStatus,
      folderBreakdown,
      uncoveredTopFiles,
    };
  }

  async getProjectsCoveragePercentage(_userId: string, projectIds: string[]): Promise<Map<string, number>> {
    if (!projectIds.length) return new Map();
    const db = this.database.getDb();

    // 1. Fetch project files for all given project IDs
    const fileRows = await db
      .select({ projectId: projectFiles.projectId, filePath: projectFiles.filePath })
      .from(projectFiles)
      .where(inArray(projectFiles.projectId, projectIds));

    // 2. Fetch note paths and metadata for all given project IDs
    const noteRows = await db
      .select({ projectId: notes.projectId, path: notes.path, metadata: notes.metadata })
      .from(notes)
      .where(inArray(notes.projectId, projectIds));

    // 3. Fetch note links for all given project IDs
    const noteLinkRows = await db
      .select({ projectId: notes.projectId, target: noteLinks.target })
      .from(noteLinks)
      .innerJoin(notes, eq(notes.id, noteLinks.noteId))
      .where(
        and(
          inArray(notes.projectId, projectIds),
          isNotNull(noteLinks.target),
          ne(noteLinks.target, ''),
        ),
      );

    // Group note paths by project ID
    const projectNotePathsMap = new Map<string, Set<string>>();
    for (const id of projectIds) {
      projectNotePathsMap.set(id, new Set<string>());
    }

    for (const row of noteRows) {
      if (!row.projectId) continue;
      const set = projectNotePathsMap.get(row.projectId);
      if (!set) continue;

      if (row.path && row.path.trim()) {
        set.add(normalizeCoveragePath(row.path));
      }
      if (row.metadata && typeof row.metadata === 'object') {
        const meta = row.metadata as Record<string, any>;
        if (meta.filePath && typeof meta.filePath === 'string') {
          set.add(normalizeCoveragePath(meta.filePath));
        }
        if (meta.target && typeof meta.target === 'string') {
          set.add(normalizeCoveragePath(meta.target));
        }
        if (meta.path && typeof meta.path === 'string') {
          set.add(normalizeCoveragePath(meta.path));
        }
      }
    }

    for (const row of noteLinkRows) {
      if (!row.projectId) continue;
      const set = projectNotePathsMap.get(row.projectId);
      if (!set) continue;
      if (row.target && row.target.trim()) {
        set.add(normalizeCoveragePath(row.target));
      }
    }

    // Group eligible files by project ID
    const projectFilesMap = new Map<string, string[]>();
    for (const id of projectIds) {
      projectFilesMap.set(id, []);
    }
    for (const row of fileRows) {
      if (isEligibleFileForCoverage(row.filePath)) {
        projectFilesMap.get(row.projectId)?.push(row.filePath);
      }
    }

    const resultMap = new Map<string, number>();
    for (const id of projectIds) {
      const files = projectFilesMap.get(id) || [];
      const notePathsSet = projectNotePathsMap.get(id) || new Set();
      const totalFiles = files.length;
      if (totalFiles === 0) {
        resultMap.set(id, 100);
        continue;
      }
      let coveredCount = 0;
      for (const filePath of files) {
        if (notePathsSet.has(normalizeCoveragePath(filePath))) {
          coveredCount++;
        }
      }
      resultMap.set(id, Number(((coveredCount / totalFiles) * 100).toFixed(1)));
    }

    return resultMap;
  }

  async syncProjectFiles(projectId: string, filePaths: string[]): Promise<void> {
    const db = this.database.getDb();
    
    // Delete existing project files using Drizzle ORM
    await db.delete(projectFiles).where(eq(projectFiles.projectId, projectId));

    if (filePaths.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize);
        await db
          .insert(projectFiles)
          .values(batch.map((filePath) => ({ projectId, filePath })))
          .onConflictDoNothing();
      }
    }
  }
}
