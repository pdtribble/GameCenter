// Achievement toast notification

export function showAchievementToast(achievement) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  toast.innerHTML = `
    <div class="badge-icon">${escHtml(achievement.badge || '🏅')}</div>
    <div class="toast-body">
      <div class="toast-label">Achievement Unlocked!</div>
      <div style="font-weight:700;color:var(--color-text-primary)">${escHtml(achievement.label)}</div>
      <div class="toast-desc">${escHtml(achievement.description)}</div>
    </div>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
