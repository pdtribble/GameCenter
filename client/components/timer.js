// Turn timer component

export class TimerComponent {
  constructor(container) {
    this.container = container;
    this.interval = null;
    container.innerHTML = `
      <div class="turn-timer" id="turn-timer" style="display:none">
        <span id="timer-label" style="font-size:var(--font-size-sm)">Turn</span>
        <div class="timer-bar">
          <div class="timer-fill" id="timer-fill"></div>
        </div>
        <span id="timer-secs" style="min-width:30px;text-align:right;font-weight:700">—</span>
      </div>`;

    this.timerEl = container.querySelector('#turn-timer');
    this.fillEl = container.querySelector('#timer-fill');
    this.secsEl = container.querySelector('#timer-secs');
  }

  update({ remainingMs, playerId, totalMs }) {
    if (!remainingMs) { this.hide(); return; }
    this.timerEl.style.display = 'flex';

    const total = totalMs || 30000;
    const pct = Math.max(0, Math.min(100, (remainingMs / total) * 100));

    this.fillEl.style.width = `${pct}%`;
    this.fillEl.classList.toggle('urgent', pct < 25);
    this.secsEl.textContent = `${Math.ceil(remainingMs / 1000)}s`;

    // Animate countdown locally
    clearInterval(this.interval);
    let rem = remainingMs;
    this.interval = setInterval(() => {
      rem -= 100;
      if (rem <= 0) { clearInterval(this.interval); this.hide(); return; }
      const p = Math.max(0, (rem / total) * 100);
      this.fillEl.style.width = `${p}%`;
      this.fillEl.classList.toggle('urgent', p < 25);
      this.secsEl.textContent = `${Math.ceil(rem / 1000)}s`;
    }, 100);
  }

  hide() {
    clearInterval(this.interval);
    if (this.timerEl) this.timerEl.style.display = 'none';
  }

  destroy() {
    clearInterval(this.interval);
    this.container.innerHTML = '';
  }
}
