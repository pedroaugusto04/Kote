import { formatDisplayToken } from '../../shared/utils/format';
import { TagInput } from '../../shared/ui/tag-input';

type NoteEditorFormProps = {
  editTitle: string;
  setEditTitle: (value: string) => void;
  editRawText: string;
  setEditRawText: (value: string) => void;
  editTags: string[];
  setEditTags: (value: string[]) => void;
  editCategoryIds: string[];
  setEditCategoryIds: (value: string[]) => void;
  categories: Array<{ id: string; name: string; color?: string; colorDark?: string }> | undefined;
  isSaving: boolean;
  onSave: () => void;
};

export function NoteEditorForm({
  editTitle,
  setEditTitle,
  editRawText,
  setEditRawText,
  editTags,
  setEditTags,
  editCategoryIds,
  setEditCategoryIds,
  categories,
  isSaving,
  onSave,
}: NoteEditorFormProps) {

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isSaving) {
        onSave();
      }
    }
  };
  return (
    <>
      {/* Title Input */}
      <input
        type="text"
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        className="vault-note-title-input"
        style={{
          fontSize: '24px',
          fontWeight: '700',
          border: '1px solid var(--border)',
          padding: '8px 12px',
          borderRadius: '4px',
          width: '100%',
          maxWidth: '600px',
          backgroundColor: 'var(--bg)',
          color: 'var(--text)',
          outline: 'none',
          transition: 'border-color 0.2s ease',
        }}
        autoFocus
      />


      {/* Tags Input */}
      <div style={{ marginBottom: '16px', marginTop: '16px' }}>
        <label style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}>Tags</label>
        <TagInput
          value={editTags}
          onChange={setEditTags}
          maxTags={10}
          maxTagLength={50}
        />
      </div>

      {/* Categories Checkboxes */}
      {categories && categories.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', display: 'block' }}>Categories</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {categories.map((category) => {
              const checked = editCategoryIds.includes(category.id);
              return (
                <label
                  key={category.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: checked ? '1px solid var(--text)' : '1px solid var(--border)',
                    cursor: 'pointer',
                    backgroundColor: checked ? 'var(--bg-accent)' : 'var(--bg)',
                    transition: 'all 0.2s ease',
                    userSelect: 'none',
                  }}
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
                      '--dot-color-light': category.color || '#cccccc',
                      '--dot-color-dark': category.colorDark || category.color || '#cccccc'
                    } as React.CSSProperties}
                  />
                  <span>{formatDisplayToken(category.name)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Content Textarea */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', display: 'block' }}>Content (Markdown)</label>
        <textarea
          value={editRawText}
          onChange={(e) => setEditRawText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write note content in Markdown..."
          rows={12}
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            fontSize: '14px',
            fontFamily: 'var(--mono)',
            lineHeight: '1.6',
            resize: 'vertical',
            minHeight: '300px',
            backgroundColor: 'var(--bg)',
            color: 'var(--text)',
          }}
        />
      </div>

    </>
  );
}
