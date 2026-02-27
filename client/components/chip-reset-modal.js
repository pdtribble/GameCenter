// Chip Reset Modal — shown when player runs out of chips
import { updateChipDisplay } from '../app.js';

export function showChipResetModal(onConfirm, onCancel) {
  const existing = document.querySelector('.chip-reset-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'chip-reset-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background: #0a0f0a;
    border: 1px solid #1a2e1a;
    border-radius: 16px;
    padding: 32px 24px;
    max-width: 320px;
    width: 90%;
    text-align: center;
    font-family: 'DM Mono', monospace;
  `;

  const icon = document.createElement('div');
  icon.style.cssText = 'font-size: 3rem; margin-bottom: 16px';
  icon.textContent = '🪙';

  const title = document.createElement('div');
  title.style.cssText = 'font-size: 1.2rem; color: #a8ffa8; margin-bottom: 12px; font-weight: bold';
  title.textContent = 'OUT OF CHIPS';

  const desc = document.createElement('div');
  desc.style.cssText = 'font-size: 0.8rem; color: rgba(168,255,168,0.5); margin-bottom: 24px; line-height: 1.5';
  desc.textContent = 'Reset to 1,000 chips — free, once every 24 hours.';

  const timer = document.createElement('div');
  timer.id = 'chip-reset-timer';
  timer.style.cssText = 'font-size: 0.75rem; color: rgba(168,255,168,0.4); margin-bottom: 16px; display: none';

  const resetBtn = document.createElement('button');
  resetBtn.id = 'chip-reset-btn';
  resetBtn.style.cssText = `
    width: 100%;
    padding: 12px;
    background: #39ff14;
    color: #050a05;
    border: none;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: bold;
    letter-spacing: 1px;
    cursor: pointer;
    margin-bottom: 10px;
  `;
  resetBtn.textContent = 'RESET TO 1,000 CHIPS';

  const cancelBtn = document.createElement('button');
  cancelBtn.style.cssText = `
    width: 100%;
    padding: 12px;
    background: transparent;
    color: #39ff14;
    border: 1px solid #39ff14;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.8rem;
    letter-spacing: 1px;
    cursor: pointer;
  `;
  cancelBtn.textContent = 'CANCEL';

  card.appendChild(icon);
  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(timer);
  card.appendChild(resetBtn);
  card.appendChild(cancelBtn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  let countdownInterval = null;

  async function checkResetStatus() {
    try {
      const res = await fetch('/api/chips');
      if (res.status === 401) {
        // Not logged in
        if (onCancel) onCancel();
        close();
        return;
      }
      const data = await res.json();
      if (data.chips > 0) {
        // Has chips now, close modal
        if (onConfirm) onConfirm();
        close();
        return;
      }
    } catch (e) {}
  }

  async function updateTimer() {
    try {
      const res = await fetch('/api/chips/reset', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        // Reset available
        timer.style.display = 'none';
        resetBtn.disabled = false;
        resetBtn.textContent = 'RESET TO 1,000 CHIPS';
        resetBtn.style.background = '#39ff14';
        resetBtn.style.color = '#050a05';
      } else if (data.nextReset) {
        // Cooldown active
        const ms = data.nextReset - Date.now();
        if (ms > 0) {
          const hrs = Math.floor(ms / 3600000);
          const min = Math.floor((ms % 3600000) / 60000);
          timer.textContent = `Next reset in ${hrs}h ${min}m`;
          timer.style.display = 'block';
          resetBtn.disabled = true;
          resetBtn.textContent = 'COOLDOWN ACTIVE';
          resetBtn.style.background = 'rgba(57,255,20,0.2)';
          resetBtn.style.color = 'rgba(57,255,20,0.4)';
        }
      }
    } catch (e) {}
  }

  resetBtn.addEventListener('click', async () => {
    resetBtn.disabled = true;
    resetBtn.textContent = 'RESETTING...';
    try {
      const res = await fetch('/api/chips/reset', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        updateChipDisplay(data.chips);
        if (onConfirm) onConfirm(data.chips);
        close();
      } else {
        resetBtn.textContent = data.error || 'FAILED';
        await updateTimer();
      }
    } catch (e) {
      resetBtn.textContent = 'ERROR';
      resetBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener('click', () => {
    if (onCancel) onCancel();
    close();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      if (onCancel) onCancel();
      close();
    }
  });

  updateTimer();
  countdownInterval = setInterval(updateTimer, 60000);

  function close() {
    if (countdownInterval) clearInterval(countdownInterval);
    overlay.remove();
  }

  return { close };
}
