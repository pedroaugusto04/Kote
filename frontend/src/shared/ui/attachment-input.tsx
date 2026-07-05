import React from 'react';

export type PendingAttachment = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
};

type AttachmentInputProps = {
  value: PendingAttachment[];
  onChange: (attachments: PendingAttachment[]) => void;
  multiple?: boolean;
  disabled?: boolean;
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export function AttachmentInput({
  value,
  onChange,
  multiple = true,
  disabled = false,
}: AttachmentInputProps) {
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newAttachments = [...value];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64 = await fileToBase64(file);
        newAttachments.push({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          dataBase64: base64,
        });
      } catch (error) {
        console.error('Failed to read file:', error);
      }
    }
    onChange(newAttachments);
    event.target.value = '';
  };

  const removeAttachment = (indexToRemove: number) => {
    onChange(value.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div className="attachments-field">
      <label className={`icon-button note-attachment-upload ${disabled ? 'disabled' : ''}`} tabIndex={disabled ? -1 : 0}>
        <svg viewBox="0 0 16 16" width="14" height="14" style={{ marginRight: '6px' }}>
          <path
            d="M4.5 12.5v-7a3 3 0 016 0v7a1.5 1.5 0 01-3 0v-6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Attach file
        <input
          type="file"
          multiple={multiple}
          disabled={disabled}
          onChange={handleFileChange}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: disabled ? 'not-allowed' : 'pointer' }}
          aria-label="Upload files"
        />
      </label>
      {value.length > 0 && (
        <div className="attached-files-list">
          {value.map((file, index) => (
            <div key={index} className="attached-file-chip">
              <span className="file-name" title={file.fileName}>{file.fileName}</span>
              <span className="file-size">({(file.sizeBytes / 1024).toFixed(1)} KB)</span>
              <button
                type="button"
                className="remove-file-btn"
                disabled={disabled}
                onClick={() => removeAttachment(index)}
                aria-label={`Remove file ${file.fileName}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
