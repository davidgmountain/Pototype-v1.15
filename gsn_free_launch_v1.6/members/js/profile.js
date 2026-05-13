/* ====================================================================
 * GSN v1.6 — Profile view page
 * - Loads ?id=<uuid> from URL
 * - Renders profile content
 * - Adds "Send a message" form (premium-only)
 * ==================================================================== */

(function () {
  function escapeHTML(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function avatarLg(profile) {
    if (profile.photo_url) {
      return `<div class="avatar-lg" style="background-image:url('${profile.photo_url.replace(/'/g, "\\'")}')"></div>`;
    }
    const initial = (profile.display_name || '?').trim().charAt(0).toUpperCase();
    return `<div class="avatar-lg">${initial}</div>`;
  }

  function tagsHTML(arr) {
    if (!arr || arr.length === 0) return '<em style="color:#999;">No expertise tags set.</em>';
    return arr.map(t => `<span>${escapeHTML(t)}</span>`).join('');
  }

  function tierBadge(profile) {
    if (profile.role === 'admin')    return '<span class="tier-badge admin">ADMIN</span>';
    if (profile.tier === 'premium')  return '<span class="tier-badge premium">PREMIUM</span>';
    return '<span class="tier-badge free">FREE</span>';
  }

  async function init() {
    const G = window.GSN;
    const root = document.getElementById('profile-content');
    if (!G.SB) { root.innerHTML = '<p>Auth not configured.</p>'; return; }

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) { root.innerHTML = '<p>Profile id missing in URL.</p>'; return; }

    const { data: p, error } = await G.SB
      .from('profiles')
      .select('id, display_name, country, role_title, club, expertise, bio, photo_url, tier, role')
      .eq('id', id)
      .maybeSingle();

    if (error) { root.innerHTML = `<p>Error: ${escapeHTML(error.message)}</p>`; return; }
    if (!p)    { root.innerHTML = '<p>Member not found.</p>'; return; }

    const isMe = G.user && G.user.id === p.id;
    const canMessage = !isMe && (G.profile && (G.profile.tier === 'premium' || G.profile.role === 'admin'));

    let html = `
      <div class="profile-hero">
        ${avatarLg(p)}
        <div>
          <h1>${escapeHTML(p.display_name || 'Member')} ${tierBadge(p)}</h1>
          <div class="role">${escapeHTML(p.role_title || '')}${p.club ? ' &middot; ' + escapeHTML(p.club) : ''}</div>
          <div class="country">${escapeHTML(p.country || '')}</div>
          ${isMe ? '<p style="margin-top:10px;"><a href="me.html">Edit my profile →</a></p>' : ''}
        </div>
      </div>

      <div class="profile-section">
        <h2>About</h2>
        <p>${p.bio ? escapeHTML(p.bio) : '<em style="color:#999;">No bio yet.</em>'}</p>
      </div>

      <div class="profile-section">
        <h2>Expertise</h2>
        <div class="profile-tags">${tagsHTML(p.expertise)}</div>
      </div>
    `;

    if (!isMe) {
      // DM card — premium-only, but visible (locked) for free so they see what's behind upgrade
      if (canMessage) {
        html += `
          <div class="dm-card">
            <h3>Send a message to ${escapeHTML(p.display_name || 'this member')}</h3>
            <textarea id="dm-body" placeholder="Write your message…"></textarea>
            <button id="dm-send" type="button">Send message</button>
            <span class="dm-status" id="dm-status"></span>
          </div>
        `;
      } else {
        html += `
          <div class="dm-card premium-locked">
            <h3>Send a message to ${escapeHTML(p.display_name || 'this member')}</h3>
            <textarea placeholder="Write your message…"></textarea>
            <button type="button">Send message</button>
          </div>
          <p style="margin-top:14px;font-size:14px;">Direct messaging is a premium feature. <a href="upgrade.html">Upgrade to premium →</a></p>
        `;
      }
    }

    root.innerHTML = html;

    if (canMessage) {
      document.getElementById('dm-send').addEventListener('click', async () => {
        const body   = document.getElementById('dm-body').value.trim();
        const status = document.getElementById('dm-status');
        if (!body) { status.textContent = 'Write something first.'; return; }
        status.textContent = 'Sending…';
        const { error: sendErr } = await G.SB.from('messages').insert({
          from_user_id: G.user.id,
          to_user_id:   p.id,
          body
        });
        if (sendErr) { status.textContent = 'Error: ' + sendErr.message; status.style.color = '#c33'; return; }
        document.getElementById('dm-body').value = '';
        status.textContent = 'Message sent.';
        status.style.color = '';
      });
    }
  }

  document.addEventListener('gsn:ready',      (e) => { if (e.detail && e.detail.signedIn) init(); });
  document.addEventListener('gsn:authchange', (e) => { if (e.detail && e.detail.signedIn) init(); });
})();
