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
  const fileToBase64 = (f) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(URL.createObjectURL(f)); // fallback to blob if reader fails
    reader.readAsDataURL(f);
  });

  if (!window.supabaseClient) {
    console.warn('[Supabase] Client not initialized — using Data URL fallback.');
    return await fileToBase64(file);
  }

  const ext  = file.name.split('.').pop();
  const name = folder + '/' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.' + ext;

  try {
    const uploadResult = await window.supabaseClient
      .storage
      .from(bucket)
      .upload(name, file, { cacheControl: '3600', upsert: false });

    if (uploadResult.error) {
      console.warn('[Supabase] Upload failed, falling back to Data URL. Error:', uploadResult.error.message);
      return await fileToBase64(file);
    }

    const urlResult = window.supabaseClient
      .storage
      .from(bucket)
      .getPublicUrl(uploadResult.data.path);

    return urlResult.data.publicUrl;
  } catch (err) {
    console.warn('[Supabase] Exception during upload, falling back to Data URL. Error:', err.message);
    return await fileToBase64(file);
  }
}
