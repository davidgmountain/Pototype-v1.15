/* ====================================================================
 * GSN v1.6 — Messages inbox (premium-only)
 * - Lists messages received by the current user
 * - Marks them as read on view
 * - Senders are joined from profiles for display_name
 * ==================================================================== */

(function () {
  function escapeHTML(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return Math.floor(diff/60)   + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return d.toLocaleDateString();
  }

  async function init() {
    const G = window.GSN;
    const root = document.getElementById('msg-root');
    if (!G.SB || !G.user) return;

    const isPremium = G.profile && (G.profile.tier === 'premium' || G.profile.role === 'admin');
    if (!isPremium) {
      root.innerHTML = `
        <div class="gate-card">
          <h1>Messages</h1>
          <p>Direct messages are a premium feature. Upgrade to send and receive messages with any member.</p>
          <a href="upgrade.html" style="display:inline-block;background:#f5c542;color:#222;padding:10px 22px;border-radius:8px;font-weight:700;text-decoration:none;">Upgrade to premium →</a>
        </div>
      `;
      return;
    }

    root.innerHTML = '<h1>Messages</h1><p>Loading inbox…</p>';

    // Fetch messages received, then look up sender display names in a 2nd query
    const { data: msgs, error } = await G.SB
      .from('messages')
      .select('id, from_user_id, body, created_at, read_at')
      .eq('to_user_id', G.user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) { root.innerHTML = `<h1>Messages</h1><p>Error: ${escapeHTML(error.message)}</p>`; return; }
    if (!msgs || msgs.length === 0) {
      root.innerHTML = `
        <h1>Messages</h1>
        <p class="lede">No messages yet.</p>
        <p>Go to the <a href="index.html">directory</a> to find members, open a profile and send them a message.</p>
      `;
      return;
    }

    const senderIds = [...new Set(msgs.map(m => m.from_user_id))];
    const { data: senders } = await G.SB
      .from('profiles')
      .select('id, display_name')
      .in('id', senderIds);
    const nameById = {};
    (senders || []).forEach(s => { nameById[s.id] = s.display_name; });

    const html = msgs.map(m => `
      <div class="msg ${m.read_at ? '' : 'unread'}">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <span class="from"><a href="profile.html?id=${encodeURIComponent(m.from_user_id)}">${escapeHTML(nameById[m.from_user_id] || 'Unknown')}</a></span>
          <span class="when">${escapeHTML(timeAgo(m.created_at))}</span>
        </div>
        <div class="body">${escapeHTML(m.body)}</div>
      </div>
    `).join('');

    root.innerHTML = `<h1>Messages</h1><div class="msg-list">${html}</div>`;

    // Mark unread as read
    const unreadIds = msgs.filter(m => !m.read_at).map(m => m.id);
    if (unreadIds.length > 0) {
      await G.SB.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
    }
  }

  document.addEventListener('gsn:ready',      (e) => { if (e.detail && e.detail.signedIn) init(); });
  document.addEventListener('gsn:authchange', (e) => { if (e.detail && e.detail.signedIn) init(); });
})();
