import type { UpdateProjectInput } from '../models/project-input.models.js';
import type { SaveProjectInput } from '../models/repository-records.models.js';

export function toProjectUpdateInput(dto: UpdateProjectInput, existing: SaveProjectInput): Partial<SaveProjectInput> {
  return {
    displayName: dto.displayName,
    defaultTags: dto.defaultTags,
  };
}
