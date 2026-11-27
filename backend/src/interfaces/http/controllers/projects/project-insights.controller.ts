import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';

import type { AuthenticatedUser } from '../../../../application/services/auth/auth.service.js';
import { GitCommitService } from '../../../../application/services/projects/git-commit.service.js';
import {
  GenerateProjectBriefUseCase,
  GetProjectBriefUseCase,
  ListProjectBriefHistoryUseCase,
  ListProjectKnowledgeMapUseCase,
  ListProjectTimelineUseCase,
  GetProjectCoverageUseCase,
  ExportProjectNotesZipUseCase,
  ListProjectDecisionsUseCase,
  ExportProjectAdrsUseCase,
} from '../../../../application/use-cases/index.js';
import { ListProjectDependenciesUseCase } from '../../../../application/use-cases/dependency-watcher/list-project-dependencies.use-case.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, BrowserExtensionGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import {
  exportProjectNotesZipQuerySchema,
  projectDecisionsQuerySchema,
  exportProjectAdrsQuerySchema,
  projectKnowledgeMapQuerySchema,
  projectTimelineQuerySchema,
  projectCommitsQuerySchema,
  syncProjectCommitsBodySchema,
  paginationInputSchema,
  type ExportProjectNotesZipQuery,
  type ProjectDecisionsQuery,
  type ExportProjectAdrsQuery,
  type ProjectKnowledgeMapQuery,
  type ProjectTimelineQuery,
  type ProjectCommitsQuery,
  type SyncProjectCommitsBody,
  type PaginationInput,
} from '../../dto/project.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { ScopeGuard } from '../../guards/scope.guard.js';
import { Scoped, Scope } from '../../scope.decorators.js';
import type { WorkspaceScope } from '../../../../application/models/workspace-scope.models.js';
import {
  toExportProjectNotesZipInput,
  toListProjectTimelineInput,
  toListProjectKnowledgeMapInput,
  toListProjectDecisionsInput,
  toExportProjectAdrsInput,
  toListProjectCommitsInput,
} from '../../mappers/project.mapper.js';

@ApiTags('Projects')
@Controller('api/projects')
@UseGuards(AccessTokenAuthGuard)
export class ProjectInsightsController {
  constructor(
    private readonly generateProjectBriefUseCase: GenerateProjectBriefUseCase,
    private readonly getProjectBriefUseCase: GetProjectBriefUseCase,
    private readonly listProjectBriefHistoryUseCase: ListProjectBriefHistoryUseCase,
    private readonly listProjectKnowledgeMapUseCase: ListProjectKnowledgeMapUseCase,
    private readonly listProjectTimelineUseCase: ListProjectTimelineUseCase,
    private readonly getProjectCoverageUseCase: GetProjectCoverageUseCase,
    private readonly exportProjectNotesZipUseCase: ExportProjectNotesZipUseCase,
    private readonly listProjectDependenciesUseCase: ListProjectDependenciesUseCase,
    private readonly listProjectDecisionsUseCase: ListProjectDecisionsUseCase,
    private readonly exportProjectAdrsUseCase: ExportProjectAdrsUseCase,
    private readonly gitCommitService: GitCommitService,
  ) { }

  @Get('export/zip')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'optional', allowAllProjects: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export project notes as a ZIP file containing markdown files and an index' })
  @ApiResponse({ status: 200, description: 'ZIP file containing markdown notes and INDEX.md' })
  async exportNotesZip(
    @Query(new ZodValidationPipe(exportProjectNotesZipQuerySchema, 'invalid_export_zip_query')) query: ExportProjectNotesZipQuery,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Scope() scope?: WorkspaceScope,
  ) {
    const input = toExportProjectNotesZipInput(query, scope);
    const result = await this.exportProjectNotesZipUseCase.execute(user.id, input);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    return res.send(result.buffer);
  }

  @Get('timeline')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'optional' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get timeline for all projects' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  async allProjectsTimeline(
    @Query(new ZodValidationPipe(projectTimelineQuerySchema, 'invalid_project_timeline_query')) query: ProjectTimelineQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = toListProjectTimelineInput(query);
    const result = await this.listProjectTimelineUseCase.execute(user.id, input);
    return { ok: true, timeline: result.items, pagination: result.pagination };
  }

  @Get(':projectSlug/timeline')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get timeline for a specific project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async timeline(
    @Scope() scope: WorkspaceScope,
    @Query(new ZodValidationPipe(projectTimelineQuerySchema, 'invalid_project_timeline_query')) query: ProjectTimelineQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = toListProjectTimelineInput(query, scope);
    const result = await this.listProjectTimelineUseCase.execute(user.id, input);
    return { ok: true, timeline: result.items, pagination: result.pagination };
  }

  @Get(':projectSlug/knowledge-map')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get knowledge map for a project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Knowledge map retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async knowledgeMap(
    @Scope() scope: WorkspaceScope,
    @Query(new ZodValidationPipe(projectKnowledgeMapQuerySchema, 'invalid_project_knowledge_map_query')) query: ProjectKnowledgeMapQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = toListProjectKnowledgeMapInput(query, scope);
    return this.listProjectKnowledgeMapUseCase.execute(user.id, input);
  }

  @Post(':projectSlug/brief')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'required', allowAllProjects: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate project brief' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Brief generated successfully' })
  generateBrief(
    @Scope() scope: WorkspaceScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.generateProjectBriefUseCase.execute(user.id, scope.projectId!, scope.workspaceId);
  }

  @Get(':projectSlug/brief')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'required', allowAllProjects: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get project brief' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Brief retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Brief not found' })
  getBrief(
    @Scope() scope: WorkspaceScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.getProjectBriefUseCase.execute(user.id, scope.projectId!, scope.workspaceId);
  }

  @Get(':projectSlug/brief/history')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'required', allowAllProjects: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get history of project briefs' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Brief history retrieved successfully' })
  getBriefHistory(
    @Scope() scope: WorkspaceScope,
    @Query(new ZodValidationPipe(paginationInputSchema, 'invalid_pagination_input')) query: PaginationInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listProjectBriefHistoryUseCase.execute(user.id, {
      projectId: scope.projectId!,
      workspaceId: scope.workspaceId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':projectSlug/dependencies')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List monitored dependencies for a project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Project dependencies retrieved successfully' })
  async listDependencies(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
    @Param('projectSlug') _projectSlug: string,
  ) {
    const result = await this.listProjectDependenciesUseCase.execute({
      userId: user.id,
      projectId: scope.projectId!,
      projectSlug: scope.projectSlug!,
      workspaceId: scope.workspaceId,
    });
    return { ok: true, ...result };
  }

  @Get(':projectSlug/coverage')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get project knowledge coverage' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiQuery({ name: 'forceSync', required: false, description: 'Force refresh of file tree from GitHub' })
  @ApiResponse({ status: 200, description: 'Project coverage retrieved successfully' })
  async getCoverage(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
    @Query('forceSync') forceSync?: string,
  ) {
    const result = await this.getProjectCoverageUseCase.execute(user.id, {
      projectId: scope.projectId!,
      forceSync: forceSync === 'true',
    });
    return { ok: true, ...result, coverage: result };
  }

  @Get(':projectSlug/decisions')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'required', allowAllProjects: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List architecture and code decisions for a project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Project decisions retrieved successfully' })
  async listDecisions(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
    @Param('projectSlug') _projectSlug: string,
    @Query(new ZodValidationPipe(projectDecisionsQuerySchema, 'invalid_project_decisions_query')) query: ProjectDecisionsQuery,
  ) {
    const input = toListProjectDecisionsInput(query, scope);
    const result = await this.listProjectDecisionsUseCase.execute(user.id, input);
    return { ok: true, ...result };
  }

  @Get(':projectSlug/decisions/export-adr')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'required', allowAllProjects: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export project decisions as Architecture Decision Record (ADR) markdown files in a ZIP archive' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'ZIP file containing ADR markdown files and INDEX.md' })
  async exportAdrsZip(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
    @Param('projectSlug') _projectSlug: string,
    @Query(new ZodValidationPipe(exportProjectAdrsQuerySchema, 'invalid_export_adr_query')) query: ExportProjectAdrsQuery,
    @Res() res: Response,
  ) {
    const input = toExportProjectAdrsInput(query, scope);
    const result = await this.exportProjectAdrsUseCase.execute(user.id, input);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    return res.send(result.buffer);
  }

  @Get(':projectSlug/commits')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'required', allowAllProjects: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List Git commits and linked notes for a project or all projects' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug or "all"' })
  @ApiResponse({ status: 200, description: 'Project commits retrieved successfully' })
  async listCommits(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
    @Param('projectSlug') _projectSlug: string,
    @Query(new ZodValidationPipe(projectCommitsQuerySchema, 'invalid_project_commits_query')) query: ProjectCommitsQuery,
  ) {
    const input = toListProjectCommitsInput(query, scope);
    const result = await this.gitCommitService.listProjectCommits(user.id, input);
    return {
      ok: true,
      commits: result.items,
      pagination: result.pagination,
    };
  }

  @Post(':projectSlug/commits/sync')
  @UseGuards(BrowserExtensionGuard, ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync local Git commits and reconcile AI session note links' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Project commits synced and reconciled successfully' })
  async syncCommits(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
    @Param('projectSlug') _projectSlug: string,
    @Body(new ZodValidationPipe(syncProjectCommitsBodySchema, 'invalid_sync_project_commits_payload')) body: SyncProjectCommitsBody,
  ) {
    if (!scope.projectId) {
      return { ok: true, syncedCount: 0, linkedCount: 0 };
    }
    const result = await this.gitCommitService.syncProjectCommits(
      user.id,
      { workspaceId: scope.workspaceId, projectId: scope.projectId },
      body.commits,
    );
    return {
      ok: true,
      ...result,
    };
  }
}
