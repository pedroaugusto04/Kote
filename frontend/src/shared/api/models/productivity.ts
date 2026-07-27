export interface ProductivityActivityRaw {
  createdAt: string; // UTC ISO string
  type: 'note' | 'ask';
  isAi: boolean;
}

export interface CategoryActivityRaw {
  id: string;
  name: string;
  color: string;
  count: number;
}

export interface ProductivityInsightsRaw {
  activities: ProductivityActivityRaw[];
  categories: CategoryActivityRaw[];
}
