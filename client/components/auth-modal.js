// Auth modal — login / signup with dark green terminal aesthetic
// Usage: openAuthModal(onSuccess, mode = 'login')

import { setGuestMode } from '../app.js';

export function openAuthModal(onSuccess, mode = 'login') {
  // Only one auth modal at a time
  if (document.getElementById('auth-modal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'auth-modal';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:2000',
    'background:rgba(0,0,0,0.85)',
    'display:flex;align-items:center;justify-content:center',
    'padding:16px;box-sizing:border-box',
    'backdrop-filter:blur(6px)',
    '-webkit-backdrop-filter:blur(6px)',
  ].join(';');

  overlay.innerHTML = `
    <div id="auth-card" style="
      background:#0a0f0a;
      border:1px solid #1a2e1a;
      border-radius:16px;
      padding:28px 24px 24px;
      width:100%;
      max-width:360px;
      box-sizing:border-box;
      font-family:'DM Mono','Courier New',monospace;
    ">
      <div id="auth-title" style="
        color:#a8ffa8;
        font-size:0.85rem;
        letter-spacing:3px;
        text-transform:uppercase;
        margin-bottom:20px;
        text-align:center;
      "></div>

      <!-- LOGIN FIELDS -->
      <div id="auth-login-fields">
        <div style="margin-bottom:12px">
          <label style="display:block;color:rgba(168,255,168,0.5);font-size:0.65rem;letter-spacing:2px;margin-bottom:5px">USERNAME</label>
          <input id="auth-login-username" type="text" maxlength="32" autocomplete="username"
            style="width:100%;box-sizing:border-box;background:#050a05;border:1px solid #1a2e1a;border-radius:6px;padding:10px 12px;color:#a8ffa8;font-family:'DM Mono',monospace;font-size:0.82rem;outline:none"
            placeholder="your_username">
        </div>
        <div style="margin-bottom:4px">
          <label style="display:block;color:rgba(168,255,168,0.5);font-size:0.65rem;letter-spacing:2px;margin-bottom:5px">PASSWORD</label>
          <input id="auth-login-password" type="password" maxlength="128" autocomplete="current-password"
            style="width:100%;box-sizing:border-box;background:#050a05;border:1px solid #1a2e1a;border-radius:6px;padding:10px 12px;color:#a8ffa8;font-family:'DM Mono',monospace;font-size:0.82rem;outline:none"
            placeholder="••••••••">
        </div>
      </div>

      <!-- SIGNUP FIELDS -->
      <div id="auth-signup-fields" style="display:none">
        <div style="margin-bottom:12px">
          <label style="display:block;color:rgba(168,255,168,0.5);font-size:0.65rem;letter-spacing:2px;margin-bottom:5px">USERNAME</label>
          <input id="auth-signup-username" type="text" maxlength="20" autocomplete="username"
            style="width:100%;box-sizing:border-box;background:#050a05;border:1px solid #1a2e1a;border-radius:6px;padding:10px 12px;color:#a8ffa8;font-family:'DM Mono',monospace;font-size:0.82rem;outline:none"
            placeholder="3–20 chars, letters/numbers">
        </div>
        <div style="margin-bottom:12px">
          <label style="display:block;color:rgba(168,255,168,0.5);font-size:0.65rem;letter-spacing:2px;margin-bottom:5px">DISPLAY NAME <span style="color:rgba(168,255,168,0.3)">(optional)</span></label>
          <input id="auth-signup-displayname" type="text" maxlength="32" autocomplete="name"
            style="width:100%;box-sizing:border-box;background:#050a05;border:1px solid #1a2e1a;border-radius:6px;padding:10px 12px;color:#a8ffa8;font-family:'DM Mono',monospace;font-size:0.82rem;outline:none"
            placeholder="How you'll appear in games">
        </div>
        <div style="margin-bottom:12px">
          <label style="display:block;color:rgba(168,255,168,0.5);font-size:0.65rem;letter-spacing:2px;margin-bottom:5px">PASSWORD</label>
          <input id="auth-signup-password" type="password" maxlength="128" autocomplete="new-password"
            style="width:100%;box-sizing:border-box;background:#050a05;border:1px solid #1a2e1a;border-radius:6px;padding:10px 12px;color:#a8ffa8;font-family:'DM Mono',monospace;font-size:0.82rem;outline:none"
            placeholder="At least 8 characters">
        </div>
        <div style="margin-bottom:4px">
          <label style="display:block;color:rgba(168,255,168,0.5);font-size:0.65rem;letter-spacing:2px;margin-bottom:5px">CONFIRM PASSWORD</label>
          <input id="auth-signup-confirm" type="password" maxlength="128" autocomplete="new-password"
            style="width:100%;box-sizing:border-box;background:#050a05;border:1px solid #1a2e1a;border-radius:6px;padding:10px 12px;color:#a8ffa8;font-family:'DM Mono',monospace;font-size:0.82rem;outline:none"
            placeholder="••••••••">
        </div>
      </div>

      <!-- Error message -->
      <div id="auth-error" style="display:none;color:#ff4560;font-size:0.68rem;margin-top:8px;min-height:16px;line-height:1.4"></div>

      <!-- CTA button -->
      <button id="auth-submit" style="
        width:100%;padding:12px;margin-top:16px;
        background:#39ff14;color:#050a05;
        border:none;border-radius:8px;
        font-family:'DM Mono',monospace;font-size:0.78rem;
        letter-spacing:2px;font-weight:700;
        cursor:pointer;
        -webkit-tap-highlight-color:transparent;
      "></button>

      <!-- Toggle link -->
      <div style="text-align:center;margin-top:14px">
        <span id="auth-toggle-link" style="color:rgba(168,255,168,0.5);font-size:0.7rem;cursor:pointer;text-decoration:underline"></span>
      </div>

      <!-- Guest continue link (login mode only) -->
      <div id="auth-guest-link" style="text-align:center;margin-top:10px">
        <span id="auth-continue-guest" style="color:rgba(168,255,168,0.25);font-size:0.65rem;cursor:pointer">Continue as guest</span>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // ── Element refs ──────────────────────────────────────────────────────────
  const title        = overlay.querySelector('#auth-title');
  const loginFields  = overlay.querySelector('#auth-login-fields');
  const signupFields = overlay.querySelector('#auth-signup-fields');
  const errorEl      = overlay.querySelector('#auth-error');
  const submitBtn    = overlay.querySelector('#auth-submit');
  const toggleLink   = overlay.querySelector('#auth-toggle-link');
  const guestLink    = overlay.querySelector('#auth-guest-link');

  // ── Mode switching ────────────────────────────────────────────────────────
  let currentMode = mode;

  function switchMode(m) {
    currentMode = m;
    clearError();
    if (m === 'login') {
      title.textContent = 'SIGN IN';
      loginFields.style.display = 'block';
      signupFields.style.display = 'none';
      submitBtn.textContent = 'SIGN IN';
      toggleLink.textContent = 'No account? Create one';
      guestLink.style.display = 'block';
    } else {
      title.textContent = 'CREATE ACCOUNT';
      loginFields.style.display = 'none';
      signupFields.style.display = 'block';
      submitBtn.textContent = 'CREATE ACCOUNT';
      toggleLink.textContent = 'Already have an account? Sign in';
      guestLink.style.display = 'none';
    }
  }

  switchMode(currentMode);

  toggleLink.addEventListener('click', () => {
    switchMode(currentMode === 'login' ? 'signup' : 'login');
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function clearError() {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }

  function closeModal() {
    overlay.remove();
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  submitBtn.addEventListener('click', async () => {
    clearError();
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.6';

    try {
      if (currentMode === 'login') {
        const username = overlay.querySelector('#auth-login-username').value.trim();
        const password = overlay.querySelector('#auth-login-password').value;
        if (!username || !password) { showError('Username and password required.'); return; }

        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) { showError(data.error || 'Login failed.'); return; }

        setGuestMode(false);
        closeModal();
        if (typeof onSuccess === 'function') onSuccess();

      } else {
        const username    = overlay.querySelector('#auth-signup-username').value.trim();
        const displayName = overlay.querySelector('#auth-signup-displayname').value.trim();
        const password    = overlay.querySelector('#auth-signup-password').value;
        const confirm     = overlay.querySelector('#auth-signup-confirm').value;

        if (!username || !password) { showError('Username and password required.'); return; }
        if (password !== confirm)   { showError('Passwords do not match.'); return; }
        if (password.length < 8)    { showError('Password must be at least 8 characters.'); return; }

        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, display_name: displayName || undefined, password }),
        });
        const data = await res.json();
        if (!res.ok) { showError(data.error || 'Signup failed.'); return; }

        setGuestMode(false);
        closeModal();
        if (typeof onSuccess === 'function') onSuccess();
      }
    } catch (_e) {
      showError('Network error. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
    }
  });

  // ── Continue as guest ─────────────────────────────────────────────────────
  overlay.querySelector('#auth-continue-guest').addEventListener('click', closeModal);

  // ── ESC key + backdrop click ──────────────────────────────────────────────
  function onKey(e) {
    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onKey); }
  }
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) { closeModal(); document.removeEventListener('keydown', onKey); }
  });
}
