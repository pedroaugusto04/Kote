import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { formatDisplayToken } from '../../shared/utils/format';
import { TagInput } from '../../shared/ui/tag-input';
import { Select } from '../../shared/ui/select';
import { AttachmentInput, type PendingAttachment } from '../../shared/ui/attachment-input';
import type { Project } from '../../shared/api/models/project';
import type { FlatProjectFolder } from '../../features/projects/projects.types';

type NoteEditorFormProps = {
  // Title & Markdown content
  editTitle: string;
  setEditTitle: (value: string) => void;
  editRawText: string;
  setEditRawText: (value: string) => void;

  // Context: Project & Folder
  projects?: Project[];
  editProjectSlug: string;
  setEditProjectSlug: (value: string) => void;
  folders: FlatProjectFolder[];
  editFolderId: string;
  setEditFolderId: (value: string) => void;

  // Metadata: Tags & Categories
  editTags: string[];
  setEditTags: (value: string[]) => void;
  editCategoryIds: string[];
  setEditCategoryIds: (value: string[]) => void;
  categories: Array<{ id: string; name: string; color?: string; colorDark?: string }> | undefined;

  // Metadata: Reminder
  editReminderAt: string;
  setEditReminderAt: (value: string) => void;

  // Metadata: Attachments
  existingAttachments?: Array<{ id: string; fileName: string; sizeBytes: number }>;
  editAttachments: PendingAttachment[];
  setEditAttachments: (attachments: PendingAttachment[]) => void;

  // Status & Actions
  isSaving: boolean;
  onSave: () => void;
};

export function NoteEditorForm({
  editTitle,
  setEditTitle,
  editRawText,
  setEditRawText,
  projects,
  editProjectSlug,
  setEditProjectSlug,
  folders,
  editFolderId,
  setEditFolderId,
  editTags,
  setEditTags,
  editCategoryIds,
  setEditCategoryIds,
  categories,
  editReminderAt,
  setEditReminderAt,
  existingAttachments,
  editAttachments,
  setEditAttachments,
  isSaving,
  onSave,
}: NoteEditorFormProps) {
  const [showCategories, setShowCategories] = useState(
    Boolean(editCategoryIds.length > 0)
  );
  const [showTags, setShowTags] = useState(
    Boolean(editTags.length > 0)
  );
  const [showReminder, setShowReminder] = useState(
    Boolean(editReminderAt)
  );
  const [showAttachments, setShowAttachments] = useState(
    Boolean(editAttachments.length > 0 || (existingAttachments && existingAttachments.length > 0))
  );

  const isCategoriesVisible = showCategories || editCategoryIds.length > 0;
  const isTagsVisible = showTags || editTags.length > 0;
  const isReminderVisible = showReminder || Boolean(editReminderAt);
  const isAttachmentsVisible = showAttachments || editAttachments.length > 0 || Boolean(existingAttachments && existingAttachments.length > 0);
  const totalAttachmentsCount = (existingAttachments?.length || 0) + editAttachments.length;

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isSaving) {
        onSave();
      }
    }
  };

  const hasProjects = Boolean(projects && projects.length > 0);

  return (
    <div className="vault-note-editor-form" onKeyDown={handleKeyDown}>
      {/* 1. Context Row: Project and Folder selectors */}
      <div className="vault-edit-context-row">
        {hasProjects && (
          <div className="vault-edit-context-field">
            <label htmlFor="vault-edit-project" className="vault-edit-label">Project</label>
            <Select
              id="vault-edit-project"
              ariaLabel="Select project"
              options={projects!.map((p) => ({
                value: p.projectSlug,
                label: p.displayName,
              }))}
              value={editProjectSlug}
              onChange={setEditProjectSlug}
              disabled={isSaving}
            />
          </div>
        )}

        <div className="vault-edit-context-field">
          <label htmlFor="vault-edit-folder" className="vault-edit-label">Folder</label>
          <Select
            id="vault-edit-folder"
            ariaLabel="Select folder"
            options={[
              { value: '', label: 'Root' },
              ...folders.map((f) => ({
                value: f.id,
                label: f.displayName,
                depth: f.depth,
              })),
            ]}
            value={editFolderId}
            onChange={setEditFolderId}
            disabled={isSaving}
          />
        </div>
      </div>

      {/* 2. In-Place Title Input */}
      <input
        type="text"
        id="vault-edit-title"
        aria-label="Note title"
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        placeholder="Note title (e.g. Local environment setup)"
        className="vault-note-title-input"
        disabled={isSaving}
        autoFocus
      />

      {/* 3. Progressive Disclosure Meta Toolbar */}
      <div className="quick-note-meta-triggers vault-meta-triggers" role="toolbar" aria-label="Add note details">
        <button
          type="button"
          className={`meta-toggle-btn ${isCategoriesVisible ? 'active' : ''}`}
          onClick={() => setShowCategories((v) => !v)}
          aria-expanded={isCategoriesVisible}
          title="Toggle categories"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M1.5 8.5L8.5 1.5H14.5V7.5L7.5 14.5L1.5 8.5Z" />
            <circle cx="11.5" cy="4.5" r="1" fill="currentColor" />
          </svg>
          <span>{editCategoryIds.length > 0 ? `${editCategoryIds.length} categories` : '+ Category'}</span>
        </button>

        <button
          type="button"
          className={`meta-toggle-btn ${isTagsVisible ? 'active' : ''}`}
          onClick={() => setShowTags((v) => !v)}
          aria-expanded={isTagsVisible}
          title="Toggle tags"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3">
            <line x1="2.5" y1="6" x2="13.5" y2="6" />
            <line x1="2.5" y1="10" x2="13.5" y2="10" />
            <line x1="6" y1="2.5" x2="4.5" y2="13.5" />
            <line x1="11.5" y1="2.5" x2="10" y2="13.5" />
          </svg>
          <span>{editTags.length > 0 ? `${editTags.length} tags` : '+ Tags'}</span>
        </button>

        <button
          type="button"
          className={`meta-toggle-btn ${isReminderVisible ? 'active' : ''}`}
          onClick={() => setShowReminder((v) => !v)}
          aria-expanded={isReminderVisible}
          title="Toggle reminder"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3">
            <circle cx="8" cy="8" r="6" />
            <polyline points="8 4.5 8 8 10.5 9.5" />
          </svg>
          <span>{editReminderAt ? 'Reminder set' : '+ Reminder'}</span>
        </button>

        <button
          type="button"
          className={`meta-toggle-btn ${isAttachmentsVisible ? 'active' : ''}`}
          onClick={() => setShowAttachments((v) => !v)}
          aria-expanded={isAttachmentsVisible}
          title="Toggle attachments"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path
              d="M4.5 12.5v-7a3 3 0 016 0v7a1.5 1.5 0 01-3 0v-6.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{totalAttachmentsCount > 0 ? `${totalAttachmentsCount} files` : '+ Attachments'}</span>
        </button>
      </div>

      {/* 4. Conditionally Expanded Sections */}
      {isCategoriesVisible && categories && categories.length > 0 && (
        <div className="quick-note-section-card vault-edit-card">
          <div className="categories-pill-list">
            {categories.map((category) => {
              const checked = editCategoryIds.includes(category.id);
              return (
                <label
                  key={category.id}
                  className={`category-chip ${checked ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    value={category.id}
                    style={{ display: 'none' }}
                    onChange={() => {
                      const nextValue = checked
                        ? editCategoryIds.filter((id) => id !== category.id)
                        : [...editCategoryIds, category.id];
                      setEditCategoryIds(nextValue);
                    }}
                  />
                  <span
                    className="category-dot"
                    style={{
                      '--dot-color-light': category.color || '#94a3b8',
                      '--dot-color-dark': category.colorDark || category.color || '#94a3b8',
                    } as CSSProperties}
                  />
                  <span>{formatDisplayToken(category.name)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {(isTagsVisible || isReminderVisible) && (
        <div className="vault-edit-meta-grid">
          {isTagsVisible && (
            <div className="vault-edit-card">
              <label className="vault-edit-label" style={{ marginBottom: '6px', display: 'block' }}>Tags</label>
              <TagInput
                value={editTags}
                onChange={setEditTags}
                maxTags={10}
                maxTagLength={50}
              />
            </div>
          )}

          {isReminderVisible && (
            <div className="vault-edit-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="vault-edit-label" htmlFor="vault-edit-reminder" style={{ margin: 0 }}>Reminder</label>
                {editReminderAt && (
                  <button
                    type="button"
                    onClick={() => setEditReminderAt('')}
                    className="vault-edit-clear-btn"
                    title="Clear reminder"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                id="vault-edit-reminder"
                type="datetime-local"
                className="vault-reminder-input"
                value={editReminderAt}
                onChange={(e) => setEditReminderAt(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {isAttachmentsVisible && (
        <div className="vault-edit-card vault-edit-attachments-card">
          <label className="vault-edit-label" style={{ marginBottom: '8px', display: 'block' }}>Attachments</label>
          {existingAttachments && existingAttachments.length > 0 && (
            <div className="attached-files-list" style={{ marginBottom: '10px' }}>
              {existingAttachments.map((file) => (
                <div key={file.id} className="attached-file-chip" title="Existing attachment">
                  <span className="file-name" title={file.fileName}>{file.fileName}</span>
                  <span className="file-size">({(file.sizeBytes / 1024).toFixed(1)} KB)</span>
                </div>
              ))}
            </div>
          )}
          <AttachmentInput
            value={editAttachments}
            onChange={setEditAttachments}
            disabled={isSaving}
          />
        </div>
      )}

      {/* 5. Spacious Content Textarea */}
      <div className="vault-edit-content-wrap">
        <label className="vault-edit-label" htmlFor="vault-edit-content" style={{ marginBottom: '6px', display: 'block' }}>
          Content (Markdown)
        </label>
        <textarea
          id="vault-edit-content"
          aria-label="Note content in Markdown"
          value={editRawText}
          onChange={(e) => setEditRawText(e.target.value)}
          placeholder="Write note content in Markdown..."
          rows={14}
          className="vault-raw-text-editor"
          disabled={isSaving}
        />
      </div>
    </div>
  );
}
