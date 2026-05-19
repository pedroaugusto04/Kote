export const INSERT_ATTACHMENT_SQL = `insert into kb_attachments (id, user_id, note_id, file_name, mime_type, size_bytes, storage_key, checksum_sha256, metadata)
 values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
 returning *`;
