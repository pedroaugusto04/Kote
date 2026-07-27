export type ProductivityActivityRaw = {
  createdAt: string; // UTC ISO string
  type: 'note' | 'ask';
  isAi: boolean;
};

export type ProductivityInsightsRaw = {
  activities: ProductivityActivityRaw[];
};
