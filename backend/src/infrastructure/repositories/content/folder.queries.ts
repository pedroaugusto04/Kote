export const UPSERT_PROJECT_FOLDER_SQL = `insert into kb_project_folders (
   id, user_id, workspace_slug, project_slug, parent_folder_id, display_name, folder_slug, full_slug_path
 )
 values ($1, $2, $3, $4, $5, $6, $7, $8)
 on conflict (id)
 do update set
   workspace_slug = excluded.workspace_slug,
   project_slug = excluded.project_slug,
   parent_folder_id = excluded.parent_folder_id,
   display_name = excluded.display_name,
   folder_slug = excluded.folder_slug,
   full_slug_path = excluded.full_slug_path,
   updated_at = now()
 returning *`;
