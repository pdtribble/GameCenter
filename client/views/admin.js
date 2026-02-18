// Admin panel client view — links to server-rendered admin page
// The actual admin panel is server-rendered HTML at /admin

export function renderAdmin(container, socket, state, navigate) {
  container.innerHTML = `
    <div class="page">
      <h1 class="section-heading">Admin Panel</h1>
      <p class="text-muted" style="margin-bottom:var(--spacing-lg)">
        The admin panel is server-rendered. Click below to open it.
      </p>
      <div class="card" style="display:flex;flex-direction:column;gap:var(--spacing-md)">
        <div class="form-group">
          <label>Admin PIN</label>
          <input class="input" type="password" id="admin-pin-input" placeholder="Enter admin PIN">
        </div>
        <button class="btn btn-primary" id="btn-open-admin">Open Admin Panel</button>
        <button class="btn btn-secondary btn-sm" id="btn-back">← Back to Home</button>
      </div>
    </div>`;

  container.querySelector('#btn-open-admin').addEventListener('click', () => {
    const pin = container.querySelector('#admin-pin-input').value.trim();
    window.open(`/admin?pin=${encodeURIComponent(pin)}`, '_blank');
  });

  container.querySelector('#btn-back').addEventListener('click', () => navigate('home'));

  return { destroy() {} };
}
