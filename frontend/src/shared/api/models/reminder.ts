export type Reminder = {
  id: string;
  title: string;
  project: string;
  workspace?: string;
  status: string;
  reminderDate: string;
  reminderTime: string;
  reminderAt: string;
  relativePath: string;
};
