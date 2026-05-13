/* ====================================================================
 * GSN v1.6 — Edit my profile
 * ==================================================================== */

(function () {
  function fill(profile) {
    document.getElementById('me-name').value       = profile.display_name || '';
    document.getElementById('me-country').value    = profile.country      || '';
    document.getElementById('me-role-title').value = profile.role_title   || '';
    document.getElementById('me-club').value       = profile.club         || '';
    document.getElementById('me-expertise').value  = (profile.expertise || []).join(', ');
    document.getElementById('me-bio').value        = profile.bio          || '';
    document.getElementById('me-photo').value      = profile.photo_url    || '';
  }

  function init() {
    const G = window.GSN;
    if (!G.SB || !G.user) return;

    if (G.profile) fill(G.profile);

    document.getElementById('me-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = document.getElementById('me-status');
      status.textContent = 'Saving…';
      const exp = document.getElementById('me-expertise').value
        .split(',').map(s => s.trim()).filter(Boolean);

      const updates = {
        display_name: document.getElementById('me-name').value.trim(),
        country:      document.getElementById('me-country').value.trim() || null,
        role_title:   document.getElementById('me-role-title').value.trim() || null,
        club:         document.getElementById('me-club').value.trim() || null,
        expertise:    exp,
        bio:          document.getElementById('me-bio').value.trim() || null,
        photo_url:    document.getElementById('me-photo').value.trim() || null
      };

      const { error } = await G.SB.from('profiles').update(updates).eq('id', G.user.id);
      if (error) { status.textContent = 'Error: ' + error.message; status.style.color = '#c33'; return; }

      // Refresh local profile so other pages see the change immediately
      await G.refreshProfile();
      status.textContent = 'Saved.';
      status.style.color = '';
    });
  }

  document.addEventListener('gsn:ready',      (e) => { if (e.detail && e.detail.signedIn) init(); });
  document.addEventListener('gsn:authchange', (e) => { if (e.detail && e.detail.signedIn) init(); });
})();
