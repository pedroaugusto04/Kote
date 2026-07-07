import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../../../application/auth.js';
import {
  CreateProjectFolderUseCase,
  CreateProjectUseCase,
  DeleteProjectFolderUseCase,
  DeleteProjectUseCase,
  GenerateProjectBriefUseCase,
  GetProjectBriefUseCase,
  ListProjectBriefHistoryUseCase,
  ListProjectFoldersUseCase,
  ListProjectKnowledgeMapUseCase,
  ListProjectTimelineUseCase,
  SetProjectFavoriteUseCase,
  UpdateProjectFolderUseCase,
  UpdateProjectUseCase,
} from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import {
  createProjectBodySchema,
  createProjectFolderBodySchema,
  projectKnowledgeMapQuerySchema,
  projectSlugParamSchema,
  projectTimelineQuerySchema,
  setProjectFavoriteBodySchema,
  updateProjectBodySchema,
  updateProjectFolderBodySchema,
  paginationInputSchema,
  type CreateProjectBody,
  type CreateProjectFolderBody,
  type ProjectKnowledgeMapQuery,
  type ProjectSlugParam,
  type ProjectTimelineQuery,
  type SetProjectFavoriteBody,
  type UpdateProjectBody,
  type UpdateProjectFolderBody,
  type PaginationInput,
} from '../../dto/project.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { ProjectResolutionGuard } from '../../guards/project-resolution.guard.js';
import { ProjectId } from '../../project.decorators.js';
import { toCreateProjectDto, toUpdateProjectDto } from '../../mappers/project.mapper.js';

@ApiTags('Projects')
@Controller('api/projects')
@UseGuards(AccessTokenAuthGuard)
export class ProjectsController {
  constructor(
    private readonly createProject: CreateProjectUseCase,
    private readonly updateProject: UpdateProjectUseCase,
    private readonly deleteProjectUseCase: DeleteProjectUseCase,
    private readonly setProjectFavoriteUseCase: SetProjectFavoriteUseCase,
    private readonly generateProjectBriefUseCase: GenerateProjectBriefUseCase,
    private readonly getProjectBriefUseCase: GetProjectBriefUseCase,
    private readonly listProjectBriefHistoryUseCase: ListProjectBriefHistoryUseCase,
    private readonly listProjectKnowledgeMapUseCase: ListProjectKnowledgeMapUseCase,
    private readonly listProjectTimelineUseCase: ListProjectTimelineUseCase,
    private readonly listProjectFoldersUseCase: ListProjectFoldersUseCase,
    private readonly createProjectFolderUseCase: CreateProjectFolderUseCase,
    private readonly updateProjectFolderUseCase: UpdateProjectFolderUseCase,
    private readonly deleteProjectFolderUseCase: DeleteProjectFolderUseCase,
  ) { }

  @Post()
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  create(
    @Body(new ZodValidationPipe(createProjectBodySchema, 'invalid_create_project_payload')) body: CreateProjectBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const dto = toCreateProjectDto(body);
    return this.createProject.execute(dto, user.id);
  }

  @Patch(':projectSlug')
  @UseGuards(TrustedOriginGuard, ProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Project updated successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  update(
    @ProjectId() projectId: string,
    @Body(new ZodValidationPipe(updateProjectBodySchema, 'invalid_update_project_payload')) body: UpdateProjectBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const dto = toUpdateProjectDto(body, projectId);
    return this.updateProject.execute(dto, user.id);
  }

  @Delete(':projectSlug')
  @UseGuards(TrustedOriginGuard, ProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  remove(
    @ProjectId() projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deleteProjectUseCase.execute(projectId, user.id);
  }

  @Patch(':projectSlug/favorite')
  @UseGuards(TrustedOriginGuard, ProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set project favorite status' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Favorite status updated' })
  setFavorite(
    @ProjectId() projectId: string,
    @Body(new ZodValidationPipe(setProjectFavoriteBodySchema, 'invalid_set_favorite_payload')) body: SetProjectFavoriteBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.setProjectFavoriteUseCase.execute(user.id, projectId, body.favorite);
  }

  @Get('timeline')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get timeline for all projects' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  async allProjectsTimeline(
    @Query(new ZodValidationPipe(projectTimelineQuerySchema, 'invalid_project_timeline_query')) query: ProjectTimelineQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.listProjectTimelineUseCase.execute(user.id, { ...query, orderByPin: query.orderByPin ?? true });
    return { ok: true, timeline: result.items, pagination: result.pagination };
  }

  @Get(':projectSlug/timeline')
  @UseGuards(ProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get timeline for a specific project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async timeline(
    @ProjectId() projectId: string,
    @Query(new ZodValidationPipe(projectTimelineQuerySchema, 'invalid_project_timeline_query')) query: ProjectTimelineQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.listProjectTimelineUseCase.execute(user.id, { ...query, projectId, orderByPin: query.orderByPin ?? true });
    return { ok: true, timeline: result.items, pagination: result.pagination };
  }

  @Get(':projectSlug/knowledge-map')
  @UseGuards(ProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get knowledge map for a project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Knowledge map retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async knowledgeMap(
    @ProjectId() projectId: string,
    @Query(new ZodValidationPipe(projectKnowledgeMapQuerySchema, 'invalid_project_knowledge_map_query')) query: ProjectKnowledgeMapQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listProjectKnowledgeMapUseCase.execute(user.id, { ...query, projectId });
  }

  @Post(':projectSlug/brief')
  @UseGuards(TrustedOriginGuard, ProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate project brief' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Brief generated successfully' })
  generateBrief(
    @ProjectId() projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.generateProjectBriefUseCase.execute(user.id, projectId);
  }

  @Get(':projectSlug/brief')
  @UseGuards(ProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get project brief' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Brief retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Brief not found' })
  getBrief(
    @ProjectId() projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.getProjectBriefUseCase.execute(user.id, projectId);
  }

  @Get(':projectSlug/brief/history')
  @UseGuards(ProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get history of project briefs' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Brief history retrieved successfully' })
  getBriefHistory(
    @ProjectId() projectId: string,
    @Query(new ZodValidationPipe(paginationInputSchema, 'invalid_pagination_input')) query: PaginationInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listProjectBriefHistoryUseCase.execute(user.id, {
      projectId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':projectSlug/folders')
  @UseGuards(ProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List project folders' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Folders retrieved successfully' })
  listFolders(
    @ProjectId() projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listProjectFoldersUseCase.execute(projectId, user.id);
  }

  @Post(':projectSlug/folders')
  @UseGuards(TrustedOriginGuard, ProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a project folder' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 201, description: 'Folder created successfully' })
  createFolder(
    @ProjectId() projectId: string,
    @Body(new ZodValidationPipe(createProjectFolderBodySchema, 'invalid_create_folder_payload')) body: CreateProjectFolderBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createProjectFolderUseCase.execute({ ...body, projectId }, user.id);
  }

  @Patch(':projectSlug/folders/:folderId')
  @UseGuards(TrustedOriginGuard, ProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a project folder' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiParam({ name: 'folderId', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Folder updated successfully' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  updateFolder(
    @ProjectId() projectId: string,
    @Param('folderId') folderId: string,
    @Body(new ZodValidationPipe(updateProjectFolderBodySchema, 'invalid_update_folder_payload')) body: UpdateProjectFolderBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.updateProjectFolderUseCase.execute({ ...body, projectId, folderId }, user.id);
  }

  @Delete(':projectSlug/folders/:folderId')
  @UseGuards(TrustedOriginGuard, ProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a project folder' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiParam({ name: 'folderId', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Folder deleted successfully' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  deleteFolder(
    @ProjectId() projectId: string,
    @Param('folderId') folderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deleteProjectFolderUseCase.execute(projectId, folderId, user.id);
  }
}
