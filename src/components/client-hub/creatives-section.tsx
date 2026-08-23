'use client';

import { useCallback, useEffect, useState } from 'react';
import { COLOR, cardStyle, sectionTitleStyle, fmtDate } from './tokens';
import { Dropzone } from './dropzone';

interface Creative {
  id: string;
  image_url: string;
  caption: string | null;
  display_order: number;
  uploaded_at: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export interface CreativesSectionProps {
  clientId: string;
  token?: string;
  editable: boolean;
}

export function CreativesSection({ clientId, token, editable }: CreativesSectionProps) {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(token ? `/api/hub/${token}/creatives` : `/api/clients/${clientId}/hub/creatives`);
      if (res.ok) {
        const json = await res.json();
        setCreatives(json.creatives ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [clientId, token]);

  useEffect(() => { load(); }, [load]);

  const handleFiles = useCallback(async (files: File[]) => {
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const base64 = await fileToBase64(file);
        const res = await fetch(`/api/clients/${clientId}/hub/creatives`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: base64, contentType: file.type }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? 'Upload failed');
        }
        const { creative } = await res.json();
        setCreatives(prev => [...prev, creative]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [clientId]);

  const handleDelete = useCallback(async (id: string) => {
    setCreatives(prev => prev.filter(c => c.id !== id));
    try {
      const res = await fetch(`/api/clients/${clientId}/hub/creatives?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      await load();
    }
  }, [clientId, load]);

  if (!editable && !loading && creatives.length === 0) return null;

  return (
    <div>
      <h2 style={sectionTitleStyle}>Ad Creatives</h2>
      {editable && (
        <div style={{ marginBottom: 16 }}>
          <Dropzone onFilesAccepted={handleFiles} disabled={uploading} />
          {error && <div style={{ fontSize: 12.5, color: COLOR.accent, marginTop: 8 }}>{error}</div>}
        </div>
      )}
      {loading ? (
        <div style={{ fontSize: 13, color: COLOR.muted, padding: '20px 0' }}>Loading…</div>
      ) : creatives.length === 0 ? (
        <div style={{ ...cardStyle, padding: '20px 24px', fontSize: 13.5, color: COLOR.muted }}>No creatives uploaded yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {creatives.map(c => (
            <div key={c.id} style={{ ...cardStyle, overflow: 'hidden', position: 'relative' }}>
              {editable && (
                <button
                  onClick={() => handleDelete(c.id)}
                  aria-label="Delete creative"
                  style={{
                    position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%',
                    background: 'rgba(28,25,23,0.65)', color: COLOR.bg, border: 'none', cursor: 'pointer',
                    fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ×
                </button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URLs, not local/optimizable assets */}
              <img src={c.image_url} alt={c.caption ?? 'Ad creative'} style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
              <div style={{ padding: '10px 12px' }}>
                {c.caption && <div style={{ fontSize: 12.5, marginBottom: 4 }}>{c.caption}</div>}
                <div style={{ fontSize: 11, color: COLOR.muted }}>{fmtDate(c.uploaded_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
