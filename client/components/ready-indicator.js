// Ready indicator component

export class ReadyIndicator {
  constructor(container) {
    this.el = document.createElement('div');
    this.el.className = 'ready-dot';
    container.appendChild(this.el);
  }

  setReady(ready) {
    this.el.classList.toggle('is-ready', !!ready);
    this.el.title = ready ? 'Ready' : 'Not ready';
  }
}
