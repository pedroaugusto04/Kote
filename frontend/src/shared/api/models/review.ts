export type ReviewFinding = {
  severity: string;
  file: string;
  line: number;
  summary: string;
  recommendation: string;
  status: string;
};

export type Review = {
  id: string;
  title: string;
  repo: string;
  project: string;
  branch: string;
  date: string;
  status: string;
  summary: string;
  impact: string;
  changedFiles: string[];
  generatedNotePath: string;
  findings: ReviewFinding[];
};
