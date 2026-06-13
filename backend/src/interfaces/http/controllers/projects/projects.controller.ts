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
  ListProjectFoldersUseCase,
  ListProjectKnowledgeMapUseCase,
  ListProjectTimelineUseCase,
  SetProjectFavoriteUseCase,
  UpdateProjectFolderUseCase,
  UpdateProjectUseCase,
} from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../auth.guards.js';
import {
  createProjectBodySchema,
  createProjectFolderBodySchema,
  projectFolderIdParamSchema,
  projectKnowledgeMapQuerySchema,
  projectSlugParamSchema,
  projectTimelineQuerySchema,
  setProjectFavoriteBodySchema,
  updateProjectBodySchema,
  updateProjectFolderBodySchema,
  type CreateProjectBody,
  type CreateProjectFolderBody,
  type ProjectFolderParam,
  type ProjectKnowledgeMapQuery,
  type ProjectSlugParam,
  type ProjectTimelineQuery,
  type SetProjectFavoriteBody,
  type UpdateProjectBody,
  type UpdateProjectFolderBody,
} from '../../dto/project.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

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
    private readonly listProjectKnowledgeMapUseCase: ListProjectKnowledgeMapUseCase,
    private readonly listProjectTimelineUseCase: ListProjectTimelineUseCase,
    private readonly listProjectFoldersUseCase: ListProjectFoldersUseCase,
    private readonly createProjectFolderUseCase: CreateProjectFolderUseCase,
    private readonly updateProjectFolderUseCase: UpdateProjectFolderUseCase,
    private readonly deleteProjectFolderUseCase: DeleteProjectFolderUseCase,
  ) {}

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
    return this.createProject.execute(body, user.id);
  }

  @Patch(':projectSlug')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Project updated successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  update(
    @Param(new ZodValidationPipe(projectSlugParamSchema, 'invalid_project_slug')) params: ProjectSlugParam,
    @Body(new ZodValidationPipe(updateProjectBodySchema, 'invalid_update_project_payload')) body: UpdateProjectBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.updateProject.execute({ ...body, projectSlug: params.projectSlug }, user.id);
  }

  @Delete(':projectSlug')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  remove(
    @Param(new ZodValidationPipe(projectSlugParamSchema, 'invalid_project_slug')) params: ProjectSlugParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deleteProjectUseCase.execute(params.projectSlug, user.id);
  }

  @Patch(':projectSlug/favorite')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set project favorite status' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Favorite status updated' })
  setFavorite(
    @Param(new ZodValidationPipe(projectSlugParamSchema, 'invalid_project_slug')) params: ProjectSlugParam,
    @Body(new ZodValidationPipe(setProjectFavoriteBodySchema, 'invalid_set_favorite_payload')) body: SetProjectFavoriteBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.setProjectFavoriteUseCase.execute(user.id, params.projectSlug, body.favorite);
  }

  @Get('timeline')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get timeline for all projects' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  async allProjectsTimeline(
    @Query(new ZodValidationPipe(projectTimelineQuerySchema, 'invalid_project_timeline_query')) query: ProjectTimelineQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.listProjectTimelineUseCase.execute(user.id, query);
    return { ok: true, timeline: result.items, pagination: result.pagination };
  }

  @Get(':projectSlug/timeline')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get timeline for a specific project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async timeline(
    @Param(new ZodValidationPipe(projectSlugParamSchema, 'invalid_project_slug')) params: ProjectSlugParam,
    @Query(new ZodValidationPipe(projectTimelineQuerySchema, 'invalid_project_timeline_query')) query: ProjectTimelineQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.listProjectTimelineUseCase.execute(user.id, { ...query, projectSlug: params.projectSlug });
    return { ok: true, timeline: result.items, pagination: result.pagination };
  }

  @Get(':projectSlug/knowledge-map')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get knowledge map for a project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Knowledge map retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async knowledgeMap(
    @Param(new ZodValidationPipe(projectSlugParamSchema, 'invalid_project_slug')) params: ProjectSlugParam,
    @Query(new ZodValidationPipe(projectKnowledgeMapQuerySchema, 'invalid_project_knowledge_map_query')) query: ProjectKnowledgeMapQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listProjectKnowledgeMapUseCase.execute(user.id, { ...query, projectSlug: params.projectSlug });
  }

  @Post(':projectSlug/brief')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate project brief' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Brief generated successfully' })
  generateBrief(
    @Param(new ZodValidationPipe(projectSlugParamSchema, 'invalid_project_slug')) params: ProjectSlugParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.generateProjectBriefUseCase.execute(user.id, params.projectSlug);
  }

  @Get(':projectSlug/brief')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get project brief' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Brief retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Brief not found' })
  getBrief(
    @Param(new ZodValidationPipe(projectSlugParamSchema, 'invalid_project_slug')) params: ProjectSlugParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.getProjectBriefUseCase.execute(user.id, params.projectSlug);
  }

  @Get(':projectSlug/folders')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List project folders' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Folders retrieved successfully' })
  listFolders(
    @Param(new ZodValidationPipe(projectSlugParamSchema, 'invalid_project_slug')) params: ProjectSlugParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listProjectFoldersUseCase.execute(params.projectSlug, user.id);
  }

  @Post(':projectSlug/folders')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a project folder' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 201, description: 'Folder created successfully' })
  createFolder(
    @Param(new ZodValidationPipe(projectSlugParamSchema, 'invalid_project_slug')) params: ProjectSlugParam,
    @Body(new ZodValidationPipe(createProjectFolderBodySchema, 'invalid_create_folder_payload')) body: CreateProjectFolderBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createProjectFolderUseCase.execute({ ...body, projectSlug: params.projectSlug }, user.id);
  }

  @Patch(':projectSlug/folders/:folderId')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a project folder' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiParam({ name: 'folderId', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Folder updated successfully' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  updateFolder(
    @Param(new ZodValidationPipe(projectFolderIdParamSchema, 'invalid_folder_id')) params: ProjectFolderParam,
    @Body(new ZodValidationPipe(updateProjectFolderBodySchema, 'invalid_update_folder_payload')) body: UpdateProjectFolderBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.updateProjectFolderUseCase.execute({ ...body, projectSlug: params.projectSlug, folderId: params.folderId }, user.id);
  }

  @Delete(':projectSlug/folders/:folderId')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a project folder' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiParam({ name: 'folderId', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Folder deleted successfully' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  deleteFolder(
    @Param(new ZodValidationPipe(projectFolderIdParamSchema, 'invalid_folder_id')) params: ProjectFolderParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deleteProjectFolderUseCase.execute(params.projectSlug, params.folderId, user.id);
  }
}
