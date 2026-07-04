export type ProductivityActivityRaw = {
  createdAt: string; // UTC ISO string
  type: 'note' | 'ask';
  isAi: boolean;
};

export type CategoryActivityRaw = {
  id: string;
  name: string;
  color: string;
  count: number;
};

export type ProductivityInsightsRaw = {
  activities: ProductivityActivityRaw[];
  categories: CategoryActivityRaw[];
};
