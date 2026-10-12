import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../../../application/services/auth/auth.service.js';
import {
  GetReviewDetailUseCase,
  ListPaginatedReviewsUseCase,
} from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard } from '../../guards/auth.guards.js';
import {
  reviewIdParamSchema,
  reviewsListQuerySchema,
  type ReviewIdParam,
  type ReviewsListQuery,
} from '../../dto/dashboard.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { paginatedResponse } from '../../http-helpers.js';

@ApiTags('Reviews')
@Controller('api/reviews')
@UseGuards(AccessTokenAuthGuard)
export class ReviewsController {
  constructor(
    private readonly listReviewsUseCase: ListPaginatedReviewsUseCase,
    private readonly getReviewDetail: GetReviewDetailUseCase,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List reviews' })
  @ApiResponse({ status: 200, description: 'Reviews retrieved successfully' })
  async reviews(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reviewsListQuerySchema, 'invalid_reviews_query')) query: ReviewsListQuery,
  ) {
    return { ok: true, ...paginatedResponse('reviews', await this.listReviewsUseCase.execute(user.id, query)) };
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get review detail' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiResponse({ status: 200, description: 'Review detail retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async review(
    @Param(new ZodValidationPipe(reviewIdParamSchema, 'invalid_review_id')) params: ReviewIdParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const review = await this.getReviewDetail.execute(user.id, params.id);
    if (!review) throw new NotFoundException('review_not_found');
    return { ok: true, review };
  }
}
