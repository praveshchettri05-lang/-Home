/* ============================================================
   2nd Home — supabase-init.js
   Supabase Storage client initialization for photo/video uploads.

   SETUP: Replace the two placeholders below with your
   Supabase project URL and anon key from:
   https://supabase.com/dashboard/project/_/settings/api
   ============================================================ */

const SUPABASE_URL  = 'https://wcjcpxbrcqdecygoxsdy.supabase.co';   // e.g. https://xyzabc.supabase.co
const SUPABASE_ANON = 'sb_publishable_3G3qA20a45uNe6GJkXSHbg_yAZbzYzu';

// Supabase storage bucket names (must be created in your Supabase dashboard)
const SB_PHOTOS_BUCKET = 'listing-photos';
const SB_VIDEOS_BUCKET = 'listing-videos';

// Initialize client — supabase-js is loaded via CDN before this script
if (typeof supabase !== 'undefined' && SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
  window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  console.log('[Supabase] Storage client initialized.');
} else if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
  console.warn('[Supabase] Please fill in your SUPABASE_URL and SUPABASE_ANON_KEY in supabase-init.js');
  window.supabaseClient = null;
}

/**
 * Upload a single File to Supabase Storage.
 * @param {File} file - The file to upload
 * @param {string} bucket - Bucket name ('listing-photos' or 'listing-videos')
 * @param {string} folder - Folder prefix (e.g. owner UID)
 * @returns {Promise<string|null>} Public URL or null on failure
 */
async function uploadToSupabase(file, bucket, folder) {
  folder = folder || 'uploads';
  window.uploadToSupabaseLastError = null;
  const fileToBase64 = (f) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(f);
  });
  const compressedPhoto = async (f) => {
    if (!f.type.startsWith('image/')) return fileToBase64(f);
    return new Promise(resolve => {
      const image = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        image.onload = () => {
          const maxDimension = 1600;
          const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        image.onerror = () => resolve(null);
        image.src = reader.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(f);
    });
  };

  if (!window.supabaseClient) {
    if (file.type.startsWith('video/')) {
      window.uploadToSupabaseLastError = 'No cloud storage client is configured for video uploads.';
      return null;
    }
    return await compressedPhoto(file);
  }

  const ext  = file.name.split('.').pop();
  const name = folder + '/' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.' + ext;

  try {
    const uploadResult = await window.supabaseClient
      .storage
      .from(bucket)
      .upload(name, file, { cacheControl: '3600', upsert: false });

    if (!uploadResult.error) {
      const urlResult = window.supabaseClient
        .storage
        .from(bucket)
        .getPublicUrl(uploadResult.data.path);
      return urlResult.data.publicUrl;
    }
    window.uploadToSupabaseLastError = uploadResult.error.message;
  } catch (err) {
    window.uploadToSupabaseLastError = err.message;
    console.warn('[Supabase] Upload failed:', err.message);
  }

  // Firebase Storage is a second cloud path for deployments where Supabase
  // buckets are not configured yet.
  if (window.storage && window.auth?.currentUser) {
    try {
      const firebaseRef = window.storage.ref(`${bucket}/${name}`);
      await firebaseRef.put(file);
      return await firebaseRef.getDownloadURL();
    } catch (err) {
      window.uploadToSupabaseLastError = err.message;
      console.warn('[Firebase Storage] Upload failed:', err.message);
    }
  }

  if (file.type.startsWith('video/')) return null;
  return await compressedPhoto(file);
}
