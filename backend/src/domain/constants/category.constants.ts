import { CanonicalType } from '../enums/knowledge.enums.js';

export interface SystemCategoryDefinition {
  name: CanonicalType;
  color: string;
  colorDark: string;
  icon: string;
  isSystem: boolean;
}

export const DEFAULT_SYSTEM_CATEGORIES: SystemCategoryDefinition[] = [
  { name: CanonicalType.Event, color: '#3f51b5', colorDark: '#53c7de', icon: 'event', isSystem: true },
  { name: CanonicalType.Decision, color: '#4caf50', colorDark: '#7dd3a5', icon: 'gavel', isSystem: true },
  { name: CanonicalType.Knowledge, color: '#2196f3', colorDark: '#53c7de', icon: 'book', isSystem: true },
  { name: CanonicalType.Incident, color: '#f44336', colorDark: '#ff7a7a', icon: 'error', isSystem: true },
  { name: CanonicalType.Followup, color: '#ff9800', colorDark: '#f0b95a', icon: 'assignment', isSystem: true },
];
