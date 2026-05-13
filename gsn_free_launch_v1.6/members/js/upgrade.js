/* ====================================================================
 * GSN v1.6 — Premium upgrade flow
 * - Free members: form to request premium (writes to upgrade_requests)
 * - Pending request: status page
 * - Premium / admin: confirmation page
 * ==================================================================== */

(function () {
  function escapeHTML(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function premiumHTML() {
    return `
      <h1>You're already premium ✦</h1>
      <p class="lede">Thanks for supporting GSN. You have full directory search, member messaging, and early access to new features.</p>
      <p><a href="index.html">Back to the directory →</a></p>
    `;
  }

  function pendingHTML(req) {
    return `
      <h1>Upgrade request pending</h1>
      <div class="notice info">
        We've received your premium request — an admin will review it shortly. We'll flip your account to premium and you'll see the new features the next time you reload.
      </div>
      <p style="color:#666;font-size:14px;">Submitted ${new Date(req.requested_at).toLocaleString()}.</p>
      <p><a href="index.html">Back to the directory →</a></p>
    `;
  }

  function formHTML() {
    return `
      <h1>Upgrade to premium</h1>
      <div class="upgrade-box">
        <h2>What you get with premium</h2>
        <ul>
          <li><strong>Advanced search</strong> — filter the member directory by role, club and expertise</li>
          <li><strong>Direct messaging</strong> — message any member, with a private inbox</li>
          <li><strong>Early access</strong> — new tools and reports rolled out to premium first</li>
        </ul>
        <p>While we're in beta, premium is free — just tell us a little about why you'd find it useful and an admin will switch you over.</p>
        <textarea id="upg-reason" placeholder="Optional: what would you use the premium features for?"></textarea>
        <button id="upg-submit" type="button">Request premium access</button>
        <span style="margin-left:12px;color:#0a7a72;font-size:13px;" id="upg-status"></span>
      </div>
    `;
  }

  async function init() {
    const G = window.GSN;
    const root = document.getElementById('upgrade-root');
    if (!G.SB || !G.user) return;

    // If already premium/admin, show confirmation
    if (G.profile && (G.profile.tier === 'premium' || G.profile.role === 'admin')) {
      root.innerHTML = premiumHTML();
      return;
    }

    // Check for a pending request
    const { data: existing } = await G.SB
      .from('upgrade_requests')
      .select('id, requested_at, status, reason')
      .eq('user_id', G.user.id)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      root.innerHTML = pendingHTML(existing);
      return;
    }

    root.innerHTML = formHTML();
    document.getElementById('upg-submit').addEventListener('click', async () => {
      const reason = document.getElementById('upg-reason').value.trim() || null;
      const status = document.getElementById('upg-status');
      status.textContent = 'Submitting…';
      const { error } = await G.SB.from('upgrade_requests').insert({
        user_id: G.user.id,
        reason,
        status: 'pending'
      });
      if (error) { status.textContent = 'Error: ' + error.message; status.style.color = '#c33'; return; }
      // Re-render the pending state
      init();
    });
  }

  document.addEventListener('gsn:ready',      (e) => { if (e.detail && e.detail.signedIn) init(); });
  document.addEventListener('gsn:authchange', (e) => { if (e.detail && e.detail.signedIn) init(); });
})();
