import { Body, Controller, Get, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../../../application/services/auth/auth.service.js';
import {
  ListPaginatedRemindersUseCase,
  ListReminderBoardUseCase,
  UpdateReminderStatusUseCase,
  BulkUpdateReminderStatusUseCase,
} from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard } from '../../guards/auth.guards.js';
import {
  reminderBoardQuerySchema,
  reminderIdParamSchema,
  remindersListQuerySchema,
  updateReminderStatusBodySchema,
  bulkUpdateReminderStatusBodySchema,
  type ReminderBoardQuery,
  type ReminderIdParam,
  type RemindersListQuery,
  type UpdateReminderStatusBody,
  type BulkUpdateReminderStatusBody,
} from '../../dto/dashboard.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { paginatedResponse } from '../../http-helpers.js';

@ApiTags('Reminders')
@Controller('api/reminders')
@UseGuards(AccessTokenAuthGuard)
export class RemindersController {
  constructor(
    private readonly listRemindersUseCase: ListPaginatedRemindersUseCase,
    private readonly listReminderBoardUseCase: ListReminderBoardUseCase,
    private readonly updateReminderStatusUseCase: UpdateReminderStatusUseCase,
    private readonly bulkUpdateReminderStatusUseCase: BulkUpdateReminderStatusUseCase,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List reminders' })
  @ApiResponse({ status: 200, description: 'Reminders retrieved successfully' })
  async reminders(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(remindersListQuerySchema, 'invalid_reminders_query')) query: RemindersListQuery,
  ) {
    return { ok: true, ...paginatedResponse('reminders', await this.listRemindersUseCase.execute(user.id, query)) };
  }

  @Get('board')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reminder board' })
  @ApiResponse({ status: 200, description: 'Reminder board retrieved successfully' })
  async reminderBoard(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reminderBoardQuerySchema, 'invalid_reminder_board_query')) query: ReminderBoardQuery,
  ) {
    return { ok: true, ...(await this.listReminderBoardUseCase.execute(user.id, query)) };
  }

  @Patch('bulk/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk update reminder statuses' })
  @ApiResponse({ status: 200, description: 'Reminder statuses updated successfully' })
  async bulkUpdateReminderStatus(
    @Body(new ZodValidationPipe(bulkUpdateReminderStatusBodySchema, 'invalid_bulk_update_reminder_status_payload')) body: BulkUpdateReminderStatusBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bulkUpdateReminderStatusUseCase.execute({
      userId: user.id,
      ids: body.ids,
      status: body.status,
    });
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update reminder status' })
  @ApiParam({ name: 'id', description: 'Reminder ID' })
  @ApiResponse({ status: 200, description: 'Reminder status updated' })
  @ApiResponse({ status: 404, description: 'Reminder not found' })
  async updateReminderStatus(
    @Param(new ZodValidationPipe(reminderIdParamSchema, 'invalid_reminder_id')) params: ReminderIdParam,
    @Body(new ZodValidationPipe(updateReminderStatusBodySchema, 'invalid_reminder_status_payload')) body: UpdateReminderStatusBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.updateReminderStatusUseCase.execute(user.id, { id: params.id, status: body.status });
    if (!result.ok) throw new NotFoundException(result.reason);
    return result;
  }
}
