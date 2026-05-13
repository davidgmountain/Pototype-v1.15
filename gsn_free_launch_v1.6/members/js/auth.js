/* ====================================================================
 * GSN v1.6 — Shared auth & session bootstrap
 * --------------------------------------------------------------------
 * - Injects a magic-link login modal into every members page
 * - Loads the current Supabase session
 * - Fetches the user's profile (role, tier)
 * - Sets body classes:  gsn-signed-in / gsn-signed-out
 *                       gsn-role-admin / gsn-role-member
 *                       gsn-tier-premium / gsn-tier-free
 * - Exposes helpers:    GSN.signIn(email), GSN.signOut(),
 *                       GSN.requireSignedIn(), GSN.requireTier('premium'),
 *                       GSN.requireAdmin(), GSN.refreshProfile()
 * ==================================================================== */

window.GSN = window.GSN || {};

(function () {
  const G = window.GSN;
  G.user = null;
  G.profile = null;

  // ---- modal HTML (injected once) ------------------------------
  const MODAL_HTML = `
    <div id="gsn-auth-modal" class="gsn-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="gsn-auth-title">
      <div class="gsn-modal">
        <h3 id="gsn-auth-title">Sign in to GSN</h3>
        <p>Enter your email and we'll send you a one-click magic link. No password needed.</p>
        <form id="gsn-auth-form">
          <input type="email" id="gsn-auth-email" placeholder="you@example.com" required autocomplete="email">
          <button type="submit" id="gsn-auth-submit">Send magic link</button>
        </form>
        <div class="gsn-auth-msg" id="gsn-auth-msg" aria-live="polite"></div>
        <button type="button" class="gsn-auth-close" id="gsn-auth-close">Cancel</button>
      </div>
    </div>
  `;

  function injectModal() {
    if (document.getElementById('gsn-auth-modal')) return;
    const div = document.createElement('div');
    div.innerHTML = MODAL_HTML;
    document.body.appendChild(div.firstElementChild);

    const form  = document.getElementById('gsn-auth-form');
    const close = document.getElementById('gsn-auth-close');
    const modal = document.getElementById('gsn-auth-modal');

    close.addEventListener('click', G.closeAuth);
    modal.addEventListener('click', (e) => { if (e.target === modal) G.closeAuth(); });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = document.getElementById('gsn-auth-email').value.trim();
      const btn   = document.getElementById('gsn-auth-submit');
      if (!G.SB) { setMsg('Supabase not configured — see members/js/supabase-config.js', true); return; }
      btn.disabled = true; setMsg('Sending magic link…');
      const { error } = await G.SB.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: G.CONFIG.AUTH_REDIRECT_URL }
      });
      btn.disabled = false;
      if (error) { setMsg(error.message, true); return; }
      setMsg('Check your email for the magic link. You can close this window.');
    });
  }

  function setMsg(text, isError) {
    const el = document.getElementById('gsn-auth-msg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#c33' : 'var(--teal, #0a7a72)';
  }

  function setBodyState(profile) {
    const body = document.body;
    body.classList.remove(
      'gsn-signed-in', 'gsn-signed-out',
      'gsn-role-member', 'gsn-role-admin',
      'gsn-tier-free', 'gsn-tier-premium'
    );
    if (!profile) { body.classList.add('gsn-signed-out'); return; }
    body.classList.add('gsn-signed-in');
    body.classList.add('gsn-role-' + (profile.role || 'member'));
    body.classList.add('gsn-tier-' + (profile.tier || 'free'));
  }

  async function loadProfile(user) {
    if (!user || !G.SB) return null;
    const { data, error } = await G.SB
      .from('profiles')
      .select('id, role, tier, display_name, country, role_title, club, expertise, bio, photo_url')
      .eq('id', user.id)
      .maybeSingle();
    if (error) { console.warn('[GSN] profile load error', error); return null; }
    if (data) return data;
    // bootstrap a profile row on first sign-in
    const { data: created } = await G.SB
      .from('profiles')
      .insert({ id: user.id, display_name: user.email, role: 'member', tier: 'free' })
      .select('id, role, tier, display_name, country, role_title, club, expertise, bio, photo_url')
      .single();
    return created || { id: user.id, role: 'member', tier: 'free' };
  }

  // ---- public API ----------------------------------------------
  G.openAuth = function (ev) {
    if (ev) ev.preventDefault();
    if (!G.AUTH_ENABLED) {
      alert('Supabase is not configured yet. Edit members/js/supabase-config.js with your Project URL and anon key. (See GSN_v1.6_supabase_setup.md.)');
      return;
    }
    setMsg('');
    const inp = document.getElementById('gsn-auth-email');
    if (inp) inp.value = '';
    document.getElementById('gsn-auth-modal').classList.add('open');
    setTimeout(() => inp && inp.focus(), 50);
  };

  G.closeAuth = function () {
    const m = document.getElementById('gsn-auth-modal');
    if (m) m.classList.remove('open');
  };

  G.signOut = async function (ev) {
    if (ev) ev.preventDefault();
    if (!G.SB) return;
    await G.SB.auth.signOut();
    G.user = null;
    G.profile = null;
    setBodyState(null);
    // Send to public home so signed-out state is obvious
    window.location.href = '../index.html';
  };

  G.refreshProfile = async function () {
    if (!G.user) return null;
    G.profile = await loadProfile(G.user);
    setBodyState(G.profile);
    return G.profile;
  };

  G.requireSignedIn = function () {
    if (!G.user) { G.openAuth(); return false; }
    return true;
  };

  G.requireTier = function (tier) {
    if (!G.profile) return false;
    if (G.profile.role === 'admin') return true; // admins bypass
    if (tier === 'premium' && G.profile.tier !== 'premium') return false;
    return true;
  };

  G.requireAdmin = function () {
    return !!(G.profile && G.profile.role === 'admin');
  };

  // ---- bootstrap on every page ---------------------------------
  document.addEventListener('DOMContentLoaded', async function () {
    injectModal();

    // Wire up any element with class .js-signin / .js-signout
    document.querySelectorAll('.js-signin').forEach(el => el.addEventListener('click', G.openAuth));
    document.querySelectorAll('.js-signout').forEach(el => el.addEventListener('click', G.signOut));

    if (!G.SB) {
      console.info('[GSN] Auth disabled until SUPABASE_URL / SUPABASE_ANON_KEY are set.');
      setBodyState(null);
      // Notify any page-specific code that bootstrap is done
      document.dispatchEvent(new CustomEvent('gsn:ready', { detail: { signedIn: false } }));
      return;
    }

    const { data: { session } } = await G.SB.auth.getSession();
    if (session && session.user) {
      G.user = session.user;
      G.profile = await loadProfile(session.user);
    }
    setBodyState(G.profile);
    document.dispatchEvent(new CustomEvent('gsn:ready', { detail: { signedIn: !!G.user, profile: G.profile } }));

    G.SB.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session && session.user) {
        G.user = session.user;
        G.profile = await loadProfile(session.user);
        setBodyState(G.profile);
        G.closeAuth();
        document.dispatchEvent(new CustomEvent('gsn:authchange', { detail: { signedIn: true, profile: G.profile } }));
      } else if (event === 'SIGNED_OUT') {
        G.user = null;
        G.profile = null;
        setBodyState(null);
        document.dispatchEvent(new CustomEvent('gsn:authchange', { detail: { signedIn: false } }));
      }
    });
  });
})();
