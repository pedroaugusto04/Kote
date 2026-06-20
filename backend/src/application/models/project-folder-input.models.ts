export type CreateProjectFolderInput = {
  projectId?: string;
  projectSlug?: string;
  displayName: string;
  parentFolderId?: string;
};

export type UpdateProjectFolderInput = {
  projectId?: string;
  projectSlug?: string;
  folderId: string;
  displayName: string;
  parentFolderId?: string;
};
