'use client';

import { useRef, useState } from 'react';
import { COLOR, FONT_BODY } from './tokens';

export interface DropzoneProps {
  onFilesAccepted: (files: File[]) => void;
  disabled?: boolean;
}

/** Small, scoped-to-this-feature drag-and-drop image upload target — no reusable cross-app dropzone exists yet, and none is needed until a second feature wants one. */
export function Dropzone({ onFilesAccepted, disabled }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (files: FileList | null) => {
    if (!files || disabled) return;
    const images = [...files].filter(f => f.type.startsWith('image/'));
    if (images.length > 0) onFilesAccepted(images);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => { e.preventDefault(); setIsDragging(false); accept(e.dataTransfer.files); }}
      onClick={() => !disabled && inputRef.current?.click()}
      style={{
        border: `2px dashed ${isDragging ? COLOR.accent : COLOR.cardBorder}`,
        borderRadius: 6,
        padding: '28px 16px',
        textAlign: 'center',
        cursor: disabled ? 'default' : 'pointer',
        background: isDragging ? COLOR.divider : COLOR.card,
        color: COLOR.muted,
        fontFamily: FONT_BODY,
        fontSize: 13,
        opacity: disabled ? 0.6 : 1,
        transition: 'border-color 0.12s, background 0.12s',
      }}
    >
      {disabled ? 'Uploading…' : 'Drag screenshots here, or click to browse'}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={disabled}
        onChange={e => { accept(e.target.files); e.target.value = ''; }}
        style={{ display: 'none' }}
      />
    </div>
  );
}
