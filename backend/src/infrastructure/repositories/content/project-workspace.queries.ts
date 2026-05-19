export const PROJECT_WITH_METADATA_SELECT_SQL = `SELECT p.*,
  COALESCE((SELECT jsonb_agg(tag) FROM kb_project_default_tags WHERE project_id = p.id), '[]'::jsonb) as default_tags,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', r.id,
    'workspace_slug', r.workspace_slug,
    'external_id', r.external_id,
    'full_name', r.full_name,
    'html_url', r.html_url,
    'description', r.description,
    'default_branch', r.default_branch,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  )) FROM kb_project_repositories pr JOIN kb_repositories r ON r.id = pr.repository_id WHERE pr.project_id = p.id), '[]'::jsonb) as repositories
FROM kb_projects p`;
