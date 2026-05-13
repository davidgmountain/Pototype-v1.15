/* ====================================================================
 * GSN v1.6 — Admin dashboard
 * Admin-only:
 *   - View all members with tier + role
 *   - Approve / deny upgrade requests
 *   - Change a member's tier or role
 * Security note: RLS policies enforce this server-side too. The UI just
 * hides the controls for non-admins; the database is the real gate.
 * ==================================================================== */

(function () {
  function escapeHTML(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function tierBadge(p) {
    if (p.role === 'admin')    return '<span class="tier-badge admin">ADMIN</span>';
    if (p.tier === 'premium')  return '<span class="tier-badge premium">PREMIUM</span>';
    return '<span class="tier-badge free">FREE</span>';
  }

  async function loadRequests(root) {
    const G = window.GSN;
    const { data: reqs, error } = await G.SB
      .from('upgrade_requests')
      .select('id, user_id, reason, requested_at, status')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });
    if (error) return root.querySelector('#req-list').innerHTML = `Error: ${escapeHTML(error.message)}`;

    if (!reqs || reqs.length === 0) {
      root.querySelector('#req-list').innerHTML = '<em>No pending requests.</em>';
      return;
    }

    const userIds = reqs.map(r => r.user_id);
    const { data: users } = await G.SB
      .from('profiles')
      .select('id, display_name, country, tier')
      .in('id', userIds);
    const byId = {};
    (users || []).forEach(u => byId[u.id] = u);

    root.querySelector('#req-list').innerHTML = reqs.map(r => {
      const u = byId[r.user_id] || {};
      return `
        <div class="msg" style="background:#fff;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <strong>${escapeHTML(u.display_name || 'Unknown')}</strong>
              <span style="color:#888;font-size:13px;"> &middot; ${escapeHTML(u.country || '')}</span>
            </div>
            <div>
              <button class="btn-approve" data-req="${r.id}" data-user="${r.user_id}">Approve</button>
              <button class="btn-deny"    data-req="${r.id}">Deny</button>
            </div>
          </div>
          ${r.reason ? `<div class="body">${escapeHTML(r.reason)}</div>` : ''}
          <div style="color:#999;font-size:12px;margin-top:4px;">${new Date(r.requested_at).toLocaleString()}</div>
        </div>
      `;
    }).join('');

    root.querySelectorAll('.btn-approve').forEach(b => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        const reqId  = b.getAttribute('data-req');
        const userId = b.getAttribute('data-user');
        // 1. Upgrade their tier
        const u1 = await G.SB.from('profiles').update({ tier: 'premium' }).eq('id', userId);
        // 2. Mark request approved
        const u2 = await G.SB.from('upgrade_requests')
          .update({ status: 'approved', processed_by: G.user.id, processed_at: new Date().toISOString() })
          .eq('id', reqId);
        if (u1.error || u2.error) {
          alert('Error: ' + ((u1.error || u2.error).message));
          b.disabled = false;
          return;
        }
        loadAll();
      });
    });
    root.querySelectorAll('.btn-deny').forEach(b => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        const reqId = b.getAttribute('data-req');
        const { error: e } = await G.SB.from('upgrade_requests')
          .update({ status: 'denied', processed_by: G.user.id, processed_at: new Date().toISOString() })
          .eq('id', reqId);
        if (e) { alert('Error: ' + e.message); b.disabled = false; return; }
        loadAll();
      });
    });
  }

  async function loadMembers(root) {
    const G = window.GSN;
    const filter = (root.querySelector('#admin-filter') || {}).value || '';

    let q = G.SB.from('profiles')
      .select('id, display_name, country, role_title, club, tier, role, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (filter) q = q.ilike('display_name', '%' + filter.replace(/[%_]/g, ch => '\\'+ch) + '%');

    const { data, error } = await q;
    const tbody = root.querySelector('#members-tbody');
    if (error) { tbody.innerHTML = `<tr><td colspan="6">Error: ${escapeHTML(error.message)}</td></tr>`; return; }
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="6">No members.</td></tr>'; return; }

    tbody.innerHTML = data.map(p => `
      <tr>
        <td><a href="profile.html?id=${encodeURIComponent(p.id)}">${escapeHTML(p.display_name || '(no name)')}</a></td>
        <td>${escapeHTML(p.country || '')}</td>
        <td>${escapeHTML(p.role_title || '')}</td>
        <td>${escapeHTML(p.club || '')}</td>
        <td>${tierBadge(p)}</td>
        <td>
          <select data-uid="${p.id}" class="adm-tier">
            <option value="free"    ${p.tier === 'free'    ? 'selected' : ''}>free</option>
            <option value="premium" ${p.tier === 'premium' ? 'selected' : ''}>premium</option>
          </select>
          <select data-uid="${p.id}" class="adm-role">
            <option value="member" ${p.role === 'member' ? 'selected' : ''}>member</option>
            <option value="admin"  ${p.role === 'admin'  ? 'selected' : ''}>admin</option>
          </select>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.adm-tier').forEach(sel => sel.addEventListener('change', async () => {
      const uid = sel.getAttribute('data-uid');
      const { error: e } = await G.SB.from('profiles').update({ tier: sel.value }).eq('id', uid);
      if (e) alert('Error: ' + e.message);
      else loadAll();
    }));
    tbody.querySelectorAll('.adm-role').forEach(sel => sel.addEventListener('change', async () => {
      const uid = sel.getAttribute('data-uid');
      const { error: e } = await G.SB.from('profiles').update({ role: sel.value }).eq('id', uid);
      if (e) alert('Error: ' + e.message);
      else loadAll();
    }));
  }

  let renderedShell = false;
  function renderShell(root) {
    if (renderedShell) return;
    renderedShell = true;
    root.innerHTML = `
      <h1>Admin dashboard</h1>
      <p class="lede">All members and pending upgrade requests.</p>

      <div class="admin-requests">
        <h2>Pending upgrade requests</h2>
        <div id="req-list"><em>Loading…</em></div>
      </div>

      <div style="margin:24px 0 12px;display:flex;gap:12px;align-items:center;">
        <h2 style="margin:0;font-size:18px;">All members</h2>
        <input type="text" id="admin-filter" placeholder="Filter by name…" style="padding:8px 12px;border:1px solid #ccc;border-radius:8px;flex:0 0 240px;">
      </div>

      <div style="overflow:auto;">
        <table class="admin-table">
          <thead><tr>
            <th>Name</th><th>Country</th><th>Role / title</th><th>Club</th><th>Tier</th><th>Change</th>
          </tr></thead>
          <tbody id="members-tbody"><tr><td colspan="6">Loading…</td></tr></tbody>
        </table>
      </div>
    `;
    let filterT;
    document.getElementById('admin-filter').addEventListener('input', () => {
      clearTimeout(filterT);
      filterT = setTimeout(() => loadMembers(root), 250);
    });
  }

  async function loadAll() {
    const G = window.GSN;
    const root = document.getElementById('admin-root');
    if (!G.SB || !G.user) return;

    if (!G.profile || G.profile.role !== 'admin') {
      root.innerHTML = `
        <div class="gate-card">
          <h1>Admin only</h1>
          <p>This page is only available to admins.</p>
          <p><a href="index.html">Back to directory →</a></p>
        </div>
      `;
      return;
    }

    renderShell(root);
    await Promise.all([loadRequests(root), loadMembers(root)]);
  }

  document.addEventListener('gsn:ready',      (e) => { if (e.detail && e.detail.signedIn) loadAll(); });
  document.addEventListener('gsn:authchange', (e) => { if (e.detail && e.detail.signedIn) loadAll(); });
})();
