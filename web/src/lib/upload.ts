import { Upload } from 'tus-js-client';
import { supabase } from './supabase';

/**
 * Resumable upload to Supabase Storage (TUS). If the connection drops, the
 * upload carries on from where it stopped instead of starting again.
 */
export async function resumableUpload(bucket: string, path: string, file: Blob, onProgress: (pct: number) => void): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, 'x-upsert': 'true' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024, // Supabase requires 6 MB chunks
      metadata: { bucketName: bucket, objectName: path, contentType: file.type || 'application/octet-stream', cacheControl: '3600' },
      onError: (e) => reject(new Error(e.message.includes('row-level security') ? 'Upload not allowed.' : 'Upload failed. Check your internet and try again.')),
      onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
      onSuccess: () => resolve(),
    });
    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    });
  });
}
