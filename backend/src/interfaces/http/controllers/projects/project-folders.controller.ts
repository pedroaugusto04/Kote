import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../../../application/services/auth/auth.service.js';
import {
  CreateProjectFolderUseCase,
  DeleteProjectFolderUseCase,
  ListProjectFoldersUseCase,
  UpdateProjectFolderUseCase,
} from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import {
  createProjectFolderBodySchema,
  updateProjectFolderBodySchema,
  type CreateProjectFolderBody,
  type UpdateProjectFolderBody,
} from '../../dto/project.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { ScopeGuard } from '../../guards/scope.guard.js';
import { Scoped, Scope } from '../../scope.decorators.js';
import type { WorkspaceScope } from '../../../../application/models/workspace-scope.models.js';

@ApiTags('Projects')
@Controller('api/projects')
@UseGuards(AccessTokenAuthGuard)
export class ProjectFoldersController {
  constructor(
    private readonly listProjectFoldersUseCase: ListProjectFoldersUseCase,
    private readonly createProjectFolderUseCase: CreateProjectFolderUseCase,
    private readonly updateProjectFolderUseCase: UpdateProjectFolderUseCase,
    private readonly deleteProjectFolderUseCase: DeleteProjectFolderUseCase,
  ) { }

  @Get(':projectSlug/folders')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List project folders' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Folders retrieved successfully' })
  listFolders(
    @Scope() scope: WorkspaceScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listProjectFoldersUseCase.execute(scope.projectId!, user.id);
  }

  @Post(':projectSlug/folders')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a project folder' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 201, description: 'Folder created successfully' })
  createFolder(
    @Scope() scope: WorkspaceScope,
    @Body(new ZodValidationPipe(createProjectFolderBodySchema, 'invalid_create_folder_payload')) body: CreateProjectFolderBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createProjectFolderUseCase.execute({ ...body, projectId: scope.projectId! }, user.id);
  }

  @Patch(':projectSlug/folders/:folderId')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a project folder' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiParam({ name: 'folderId', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Folder updated successfully' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  updateFolder(
    @Scope() scope: WorkspaceScope,
    @Param('folderId') folderId: string,
    @Body(new ZodValidationPipe(updateProjectFolderBodySchema, 'invalid_update_folder_payload')) body: UpdateProjectFolderBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.updateProjectFolderUseCase.execute({ ...body, projectId: scope.projectId!, folderId }, user.id);
  }

  @Delete(':projectSlug/folders/:folderId')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a project folder' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiParam({ name: 'folderId', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Folder deleted successfully' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  deleteFolder(
    @Scope() scope: WorkspaceScope,
    @Param('folderId') folderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deleteProjectFolderUseCase.execute(scope.projectId!, folderId, user.id);
  }
}
