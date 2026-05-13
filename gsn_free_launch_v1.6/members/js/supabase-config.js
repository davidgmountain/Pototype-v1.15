/* ====================================================================
 * GSN v1.6 — Supabase configuration
 * --------------------------------------------------------------------
 * Paste your Supabase project values here.
 *   1. Go to https://supabase.com and create a (free) project.
 *   2. In your project: Settings → API
 *   3. Copy the "Project URL" into SUPABASE_URL
 *   4. Copy the "anon public" key into SUPABASE_ANON_KEY
 * The anon key is safe to ship in the browser — security is enforced
 * server-side by Row Level Security policies on your tables.
 * ==================================================================== */

window.GSN = window.GSN || {};

window.GSN.CONFIG = {
  SUPABASE_URL:      'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',
  // Where users land after clicking the magic link in their email:
  AUTH_REDIRECT_URL: window.location.origin + '/members/'
};

window.GSN.AUTH_ENABLED =
  window.GSN.CONFIG.SUPABASE_URL.indexOf('YOUR-PROJECT') === -1 &&
  window.GSN.CONFIG.SUPABASE_ANON_KEY.indexOf('YOUR-ANON') === -1;

window.GSN.SB = (window.GSN.AUTH_ENABLED && window.supabase)
  ? window.supabase.createClient(window.GSN.CONFIG.SUPABASE_URL, window.GSN.CONFIG.SUPABASE_ANON_KEY)
  : null;
