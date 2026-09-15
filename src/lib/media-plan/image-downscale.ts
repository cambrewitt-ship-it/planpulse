// Keeps a base64-encoded image POST body well under Vercel's ~4.5MB serverless
// request-body limit, which a retina screenshot can exceed even under a generous
// raw-file size cap. Client-side only (uses Image/canvas).

const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

export interface DownscaledImage {
  base64: string;
  mimeType: string;
  preview: string; // data URL, for the chat/review UI's thumbnail
}

function mimeTypeFromDataUrl(dataUrl: string): string {
  return dataUrl.slice(5, dataUrl.indexOf(';'));
}

export function downscaleImageDataUrl(dataUrl: string): Promise<DownscaledImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
      if (scale >= 1) {
        resolve({ base64: dataUrl.split(',')[1], mimeType: mimeTypeFromDataUrl(dataUrl), preview: dataUrl });
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ base64: dataUrl.split(',')[1], mimeType: mimeTypeFromDataUrl(dataUrl), preview: dataUrl });
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const resized = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      resolve({ base64: resized.split(',')[1], mimeType: 'image/jpeg', preview: resized });
    };
    img.onerror = () => reject(new Error('Could not load image for resizing.'));
    img.src = dataUrl;
  });
}

export function readFileAsDownscaledImage(file: File): Promise<DownscaledImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      try {
        resolve(await downscaleImageDataUrl(dataUrl));
      } catch {
        resolve({ base64: dataUrl.split(',')[1], mimeType: file.type, preview: dataUrl });
      }
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}
