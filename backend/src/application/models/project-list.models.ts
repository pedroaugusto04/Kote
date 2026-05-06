import type { Project } from '../../domain/projects.js';
import type { PaginationMeta } from './pagination.models.js';

export type ListProjectsInput = {
  page: number;
  pageSize: number;
  selectedSlug?: string;
};

export type PaginatedProjects = {
  items: Project[];
  pagination: PaginationMeta;
};
