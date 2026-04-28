export type VaultNoteSummary = {
  id: string;
  path: string;
  type: string;
  title: string;
  project: string;
  workspace: string;
  tags: string[];
  date: string;
  status: string;
  summary: string;
  source: string;
};

export type VaultNoteDetail = VaultNoteSummary & {
  markdown: string;
  frontmatter: Record<string, unknown>;
  links: string[];
  origin: string;
};
