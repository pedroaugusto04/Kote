import { CoverageHealthStatus } from '../../domain/enums/knowledge.enums.js';

export interface ProjectCoverageFolderBreakdown {
  folderPath: string;
  totalFiles: number;
  coveredFiles: number;
  percentage: number;
}

export interface ProjectCoverageUncoveredFile {
  path: string;
}

export interface ProjectCoverageResult {
  projectId: string;
  projectSlug: string;
  coveragePercentage: number;
  totalFiles: number;
  coveredFiles: number;
  uncoveredFiles: number;
  healthStatus: CoverageHealthStatus;
  folderBreakdown: ProjectCoverageFolderBreakdown[];
  uncoveredTopFiles: ProjectCoverageUncoveredFile[];
}
