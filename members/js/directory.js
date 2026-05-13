/* ====================================================================
 * GSN v1.6 — Member directory search
 * - Basic search (name, country) for everyone
 * - Premium filters (role, club, expertise) only applied if user has
 *   tier=premium or role=admin (free users see the inputs greyed out
 *   via CSS, and any values they somehow type are ignored here)
 * ==================================================================== */

(function () {
  function isPremium() {
    const G = window.GSN;
    return !!(G.profile && (G.profile.role === 'admin' || G.profile.tier === 'premium'));
  }

  function escapeIlike(s) {
    if (!s) return s;
    return String(s).replace(/[%_]/g, ch => '\\' + ch);
  }

  function avatarHTML(profile) {
    if (profile.photo_url) {
      return `<div class="avatar" style="background-image:url('${profile.photo_url.replace(/'/g, "\\'")}')"></div>`;
    }
    const initial = (profile.display_name || '?').trim().charAt(0).toUpperCase();
    return `<div class="avatar">${initial}</div>`;
  }

  function cardHTML(p) {
    const tags = (p.expertise || []).slice(0, 3)
      .map(t => `<span>${escapeHTML(t)}</span>`).join('');
    return `
      <a class="member-card" href="profile.html?id=${encodeURIComponent(p.id)}">
        ${avatarHTML(p)}
        <div class="meta">
          <strong>${escapeHTML(p.display_name || 'Member')}</strong>
          <div class="role">${escapeHTML(p.role_title || '')}</div>
          <div class="club">${escapeHTML(p.club || '')}</div>
          <div class="country">${escapeHTML(p.country || '')}</div>
          <div class="tags">${tags}</div>
        </div>
      </a>
    `;
  }

  function escapeHTML(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function runSearch() {
    const G = window.GSN;
    const results = document.getElementById('dir-results');
    if (!G.SB) { results.innerHTML = '<div class="dir-empty">Auth not configured.</div>'; return; }

    const name    = document.getElementById('dir-name').value.trim();
    const country = document.getElementById('dir-country').value.trim();

    results.innerHTML = '<div class="dir-loading">Searching…</div>';

    let q = G.SB.from('profiles')
      .select('id, display_name, country, role_title, club, expertise, photo_url, tier, role')
      .order('display_name', { ascending: true })
      .limit(120);

    if (name)    q = q.ilike('display_name', '%' + escapeIlike(name)    + '%');
    if (country) q = q.ilike('country',      '%' + escapeIlike(country) + '%');

    if (isPremium()) {
      const role  = document.getElementById('dir-role').value.trim();
      const club  = document.getElementById('dir-club').value.trim();
      const exp   = document.getElementById('dir-expertise').value;
      if (role) q = q.ilike('role_title', '%' + escapeIlike(role) + '%');
      if (club) q = q.ilike('club',       '%' + escapeIlike(club) + '%');
      if (exp)  q = q.contains('expertise', [exp]);
    }

    const { data, error } = await q;
    if (error) {
      results.innerHTML = `<div class="dir-empty">Error: ${escapeHTML(error.message)}</div>`;
      return;
    }
    if (!data || data.length === 0) {
      results.innerHTML = '<div class="dir-empty">No members found. Try a broader search.</div>';
      return;
    }
    results.innerHTML = data.map(cardHTML).join('');
  }

  function init() {
    const btn = document.getElementById('dir-search-btn');
    if (btn) btn.addEventListener('click', runSearch);

    // Submit on Enter in any of the inputs
    ['dir-name', 'dir-country', 'dir-role', 'dir-club'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });
    });
    const exp = document.getElementById('dir-expertise');
    if (exp) exp.addEventListener('change', runSearch);

    // Show the free-tier upsell banner
    const upsell = document.getElementById('dir-upsell');
    if (upsell && window.GSN.profile && window.GSN.profile.tier !== 'premium' && window.GSN.profile.role !== 'admin') {
      upsell.style.display = 'block';
    }

    runSearch();
  }

  document.addEventListener('gsn:ready', (e) => { if (e.detail && e.detail.signedIn) init(); });
  document.addEventListener('gsn:authchange', (e) => { if (e.detail && e.detail.signedIn) init(); });
})();
