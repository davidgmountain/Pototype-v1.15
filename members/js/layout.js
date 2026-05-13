/* ====================================================================
 * GSN v1.6 — Members area layout helpers
 * Populates the members strip (signed-in user + tier badge) using the
 * profile loaded by auth.js. Re-runs on auth state changes.
 * ==================================================================== */

(function () {
  function refreshStrip() {
    const G = window.GSN;
    if (!G) return;
    const who   = document.getElementById('gsn-who');
    const badge = document.getElementById('gsn-tier-badge');

    if (!G.user || !G.profile) {
      if (who)   who.textContent   = '';
      if (badge) badge.textContent = '';
      return;
    }

    if (who) {
      who.textContent = G.profile.display_name || G.user.email || 'You';
    }
    if (badge) {
      if (G.profile.role === 'admin') {
        badge.textContent = 'ADMIN';
        badge.className   = 'tier-badge admin';
      } else if (G.profile.tier === 'premium') {
        badge.textContent = 'PREMIUM';
        badge.className   = 'tier-badge premium';
      } else {
        badge.textContent = 'FREE';
        badge.className   = 'tier-badge free';
      }
    }
  }

  document.addEventListener('gsn:ready',      refreshStrip);
  document.addEventListener('gsn:authchange', refreshStrip);
})();
