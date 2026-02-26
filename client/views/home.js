// Multiplayer home view — game-selection grid → lobby panel flow
import { setGuestMode } from '../app.js';

// ── Accent colors per game type ───────────────────────────────────────────────
const GAME_ACCENTS = {
  'blackjack':    '#30d890',
  'poker':        '#30d890',
  'bs':           '#ff4560',
};

// ── Game descriptions / icon overrides ───────────────────────────────────────
const GAME_DESCS = {
  'blackjack': { desc: 'Classic casino card game', icon: '🃏' },
  'poker':     { desc: "Texas Hold'em No-Limit",   icon: '♠️' },
  'bs':        { desc: 'Bluffing card game',        icon: '🎭' },
};

// ── Shared styles (injected once for both mp and sp views) ────────────────────
function injectSharedStyles() {
  if (document.getElementById('gc-game-card-styles')) return;
  const s = document.createElement('style');
  s.id = 'gc-game-card-styles';
  s.textContent = `
    .mp-game-card {
      background: var(--gc-surface, #12121a);
      border: 1px solid var(--gc-border, rgba(255,255,255,0.06));
      border-radius: 12px;
      padding: 16px 14px;
      cursor: pointer;
      transition: border-color 0.15s, transform 0.1s;
      display: flex;
      flex-direction: column;
      gap: 6px;
      position: relative;
      overflow: hidden;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    .mp-game-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: var(--mp-card-accent, #9060ff);
      opacity: 0.85;
    }
    .mp-game-card:hover  { border-color: var(--mp-card-accent, #9060ff); }
    .mp-game-card:active { transform: scale(0.97); }
    .mp-game-card-icon   { font-size: 1.8rem; line-height: 1; }
    .mp-game-card-name   { font-family: var(--gc-font,'Anybody',sans-serif); font-weight: 700; font-size: 0.9rem; color: var(--gc-text, #f0f0f8); }
    .mp-game-card-desc   { font-size: 0.7rem; color: var(--gc-muted, rgba(240,240,248,0.4)); line-height: 1.4; flex: 1; }
    .mp-game-card-badge  {
      display: inline-block;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--gc-border, rgba(255,255,255,0.06));
      border-radius: 20px;
      padding: 2px 8px;
      font-family: var(--gc-mono,'DM Mono',monospace);
      font-size: 0.6rem;
      color: var(--gc-green, #30d890);
      align-self: flex-start;
    }
    .mp-lobby-item {
      background: var(--gc-surface, #12121a);
      border: 1px solid var(--gc-border, rgba(255,255,255,0.06));
      border-radius: 10px;
      padding: 11px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 52px;
      box-sizing: border-box;
    }
    /* Inline join form inside lobby item */
    .join-nick-input {
      background: #050a05;
      border: 1px solid #1a2e1a;
      border-radius: 6px;
      padding: 5px 7px;
      color: #a8ffa8;
      font-family: 'DM Mono', 'Courier New', monospace;
      font-size: 0.68rem;
      width: 88px;
      outline: none;
      box-sizing: border-box;
      flex-shrink: 1;
    }
    .join-nick-input:focus { border-color: #39ff14; }
    .join-icon-btn {
      background: none;
      border: 1px solid;
      border-radius: 5px;
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 0.78rem;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
      padding: 0;
      line-height: 1;
    }
    .join-icon-btn.confirm { border-color: #39ff14; color: #39ff14; }
    .join-icon-btn.cancel  { border-color: rgba(255,255,255,0.15); color: rgba(255,255,255,0.35); }
    .join-icon-btn.confirm:hover { background: rgba(57,255,20,0.12); }
    .join-icon-btn.cancel:hover  { background: rgba(255,255,255,0.06); }
    /* Deck selector styles */
    .cm-deck-scroll {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      padding: 8px 4px;
      margin-bottom: 12px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.2) transparent;
    }
    .cm-deck-scroll::-webkit-scrollbar { height: 4px; }
    .cm-deck-scroll::-webkit-scrollbar-track { background: transparent; }
    .cm-deck-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
    .cm-deck-item {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      padding: 8px;
      border-radius: 8px;
      border: 2px solid transparent;
      transition: all 0.15s;
    }
    .cm-deck-item:hover { background: rgba(255,255,255,0.05); }
    .cm-deck-item.selected {
      border-color: var(--gc-gold, #f0c040);
      background: rgba(240,192,64,0.1);
    }
    .cm-deck-preview {
      width: 48px;
      height: 68px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .cm-deck-name {
      font-family: var(--gc-mono,'DM Mono',monospace);
      font-size: 0.6rem;
      color: var(--gc-muted, rgba(240,240,248,0.4));
      white-space: nowrap;
    }
    .cm-deck-item.selected .cm-deck-name {
      color: var(--gc-gold, #f0c040);
    }
  `;
  document.head.appendChild(s);
}

// ── Back-button pill style (shared) ──────────────────────────────────────────
const BACK_BTN_STYLE = [
  'background:none',
  'border:1px solid var(--gc-border,rgba(255,255,255,0.06))',
  'color:var(--gc-muted,rgba(240,240,248,0.4))',
  'font-family:var(--gc-mono,\'DM Mono\',monospace)',
  'font-size:0.68rem',
  'letter-spacing:1px',
  'padding:6px 12px',
  'border-radius:6px',
  'cursor:pointer',
  'flex-shrink:0',
  '-webkit-tap-highlight-color:transparent',
  'transition:color 0.15s,border-color 0.15s',
].join(';');

// ── Render ────────────────────────────────────────────────────────────────────
export function renderHome(container, socket, state, navigate) {
  injectSharedStyles();

  const params = new URLSearchParams(location.search);
  const prefillCode = params.get('join') || '';
  if (prefillCode) history.replaceState({}, '', '/');

  container.innerHTML = `
    <div id="mp-view" style="
      height:100%;
      display:flex;
      flex-direction:column;
      background:var(--gc-bg,#0a0a0f);
      padding:16px;
      box-sizing:border-box;
      overflow:hidden;
    ">
      <!-- Header — title only, no online pill -->
      <div style="margin-bottom:16px;flex-shrink:0">
        <div style="
          font-family:var(--gc-mono,'DM Mono',monospace);
          font-size:0.72rem;
          letter-spacing:3px;
          color:var(--gc-text,#f0f0f8);
          text-transform:uppercase;
        ">MULTIPLAYER</div>
      </div>

      <!-- Game selection grid -->
      <div id="mp-games-grid" style="
        display:grid;
        grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
        gap:12px;
        overflow-y:auto;
        flex:1;
        align-content:start;
      "></div>

      <!-- Lobby panel (shown when a game card is clicked) -->
      <div id="mp-lobby-panel" style="
        display:none;
        flex-direction:column;
        gap:12px;
        flex:1;
        overflow:hidden;
      ">
        <!-- Panel header: ← BACK + game title -->
        <div style="display:flex;align-items:center;gap:12px;flex-shrink:0">
          <button id="mp-back-btn" style="${BACK_BTN_STYLE}">← BACK</button>
          <div id="mp-panel-title" style="
            font-family:var(--gc-font,'Anybody',sans-serif);
            font-weight:700;
            font-size:1rem;
            color:var(--gc-text,#f0f0f8);
          "></div>
        </div>

        <!-- Create lobby dashed button -->
        <button id="mp-create-btn" style="
          background:none;
          border:1.5px dashed var(--gc-border,rgba(255,255,255,0.06));
          color:var(--gc-muted,rgba(240,240,248,0.4));
          font-family:var(--gc-mono,'DM Mono',monospace);
          font-size:0.72rem;
          letter-spacing:1px;
          padding:12px;
          border-radius:10px;
          cursor:pointer;
          transition:border-color 0.15s,color 0.15s;
          flex-shrink:0;
          -webkit-tap-highlight-color:transparent;
        ">＋ CREATE LOBBY</button>

        <!-- Lobby list -->
        <div id="mp-lobby-list" style="
          display:flex;
          flex-direction:column;
          gap:8px;
          overflow-y:auto;
          flex:1;
        "></div>
      </div>
    </div>`;

  // ── Element refs ──────────────────────────────────────────────────────────
  const mpView     = container.querySelector('#mp-view');
  const gamesGrid  = container.querySelector('#mp-games-grid');
  const lobbyPanel = container.querySelector('#mp-lobby-panel');
  const backBtn    = container.querySelector('#mp-back-btn');
  const createBtn  = container.querySelector('#mp-create-btn');
  const panelTitle = container.querySelector('#mp-panel-title');
  const lobbyList  = container.querySelector('#mp-lobby-list');

  // ── State ─────────────────────────────────────────────────────────────────
  let allLobbies         = [];
  let gamesList          = [];
  let gameConfigs        = {};
  let gameMeta           = {};
  let currentPanelGame   = null;  // gameType shown in lobby panel
  let currentPanelLabel  = '';    // label for lobby name pre-fill
  let playerDisplayName  = '';    // from /api/me/stats, used to pre-fill nickname
  let panelEscHandler    = null;  // ESC listener reference for cleanup
  let inlineJoinActive   = false; // pause lobby list re-renders while join form open

  // ── Fetch player stats (guest mode only — online pill removed) ─────────────
  fetch('/api/me/stats')
    .then(r => r.json())
    .then(data => {
      setGuestMode(data.isGuest === true);
      if (data.loggedIn) playerDisplayName = data.displayName || '';
    })
    .catch(() => {});

  // ── Fetch games metadata ──────────────────────────────────────────────────
  fetch('/api/games')
    .then(r => r.json())
    .then(games => {
      gamesList = games || [];
      for (const g of gamesList) {
        gameConfigs[g.gameType] = g.config || [];
        gameMeta[g.gameType]    = g;
      }
      renderGameGrid();
    })
    .catch(() => {});

  // ── Poll lobbies ──────────────────────────────────────────────────────────
  function loadLobbies() {
    fetch('/api/lobbies')
      .then(r => r.json())
      .then(data => {
        allLobbies = data || [];
        updateGameBadges();
        // Don't disrupt an active inline join form
        if (currentPanelGame && !inlineJoinActive) renderLobbyList(currentPanelGame);
      })
      .catch(() => { allLobbies = []; });
  }
  loadLobbies();
  const pollTimer = setInterval(loadLobbies, 8000);

  // ── Game grid ─────────────────────────────────────────────────────────────
  function renderGameGrid() {
    gamesGrid.innerHTML = '';
    if (!gamesList.length) {
      gamesGrid.innerHTML = '<div style="color:var(--gc-muted,rgba(240,240,248,0.4));font-family:var(--gc-mono,monospace);font-size:0.8rem;grid-column:1/-1;padding:8px 0">No games available.</div>';
      return;
    }
    for (const g of gamesList) {
      const info   = GAME_DESCS[g.gameType] || {};
      const icon   = info.icon || g.icon        || '🎮';
      const desc   = info.desc || g.description || '';
      const accent = GAME_ACCENTS[g.gameType]    || '#9060ff';
      const count  = allLobbies.filter(l => l.gameType === g.gameType).length;

      const card = document.createElement('div');
      card.className = 'mp-game-card';
      card.style.setProperty('--mp-card-accent', accent);
      card.innerHTML = `
        <div class="mp-game-card-icon">${icon}</div>
        <div class="mp-game-card-name">${escHtml(g.label.toUpperCase())}</div>
        <div class="mp-game-card-desc">${escHtml(desc)}</div>
        <div class="mp-game-card-badge" data-game="${escHtml(g.gameType)}"
             style="display:${count > 0 ? 'inline-block' : 'none'}">${count} open</div>`;
      card.addEventListener('click', () => showLobbyPanel(g.gameType, g.label));
      gamesGrid.appendChild(card);
    }
  }

  function updateGameBadges() {
    gamesGrid.querySelectorAll('.mp-game-card-badge').forEach(badge => {
      const gt    = badge.dataset.game;
      const count = allLobbies.filter(l => l.gameType === gt).length;
      badge.textContent   = `${count} open`;
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    });
  }

  // ── Lobby panel show/hide ─────────────────────────────────────────────────
  function showLobbyPanel(gameType, gameLabel) {
    currentPanelGame  = gameType;
    currentPanelLabel = gameLabel || gameType;
    panelTitle.textContent = currentPanelLabel.toUpperCase();
    gamesGrid.style.display  = 'none';
    lobbyPanel.style.display = 'flex';
    inlineJoinActive = false;
    renderLobbyList(gameType);

    // ESC returns to game grid
    panelEscHandler = e => { if (e.key === 'Escape') hideLobbyPanel(); };
    document.addEventListener('keydown', panelEscHandler);
  }

  function hideLobbyPanel() {
    inlineJoinActive         = false;
    currentPanelGame         = null;
    lobbyPanel.style.display = 'none';
    gamesGrid.style.display  = 'grid';
    removePanelEsc();
  }

  function removePanelEsc() {
    if (panelEscHandler) {
      document.removeEventListener('keydown', panelEscHandler);
      panelEscHandler = null;
    }
  }

  // ── Lobby list ────────────────────────────────────────────────────────────
  function renderLobbyList(gameType) {
    if (inlineJoinActive) return;
    const filtered = allLobbies.filter(l => l.gameType === gameType);
    if (!filtered.length) {
      lobbyList.innerHTML = '<div style="color:var(--gc-muted,rgba(240,240,248,0.4));font-family:var(--gc-mono,monospace);font-size:0.78rem;text-align:center;padding:24px 0">No open lobbies.<br>Be the first to create one!</div>';
      return;
    }

    lobbyList.innerHTML = '';
    for (const lobby of filtered) {
      const isFull      = lobby.playerCount >= lobby.maxPlayers;
      const displayName = lobby.lobbyName || `${lobby.hostName}'s Lobby`;

      const item = document.createElement('div');
      item.className = 'mp-lobby-item';
      item.innerHTML = `
        <div style="flex:1;min-width:0;overflow:hidden">
          <div style="color:var(--gc-text,#f0f0f8);font-family:var(--gc-font,'Anybody',sans-serif);font-size:0.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(displayName)}</div>
          <div style="color:var(--gc-muted,rgba(240,240,248,0.4));font-family:var(--gc-mono,'DM Mono',monospace);font-size:0.62rem;margin-top:2px">Code: ${escHtml(lobby.joinCode)}</div>
        </div>
        <div class="join-area" style="display:flex;align-items:center;gap:7px;flex-shrink:0">
          <span style="
            background:rgba(255,255,255,0.04);
            border:1px solid var(--gc-border,rgba(255,255,255,0.06));
            border-radius:20px;
            padding:2px 7px;
            font-family:var(--gc-mono,'DM Mono',monospace);
            font-size:0.6rem;
            color:var(--gc-muted,rgba(240,240,248,0.4));
            white-space:nowrap;
          ">${lobby.playerCount}/${lobby.maxPlayers}</span>
          <button class="gc-card-join-btn${isFull ? ' watch' : ''}">
            ${isFull ? 'Watch' : 'JOIN'}
          </button>
        </div>`;

      item.querySelector('.gc-card-join-btn').addEventListener('click', () => {
        showInlineJoin(item, lobby, isFull);
      });
      lobbyList.appendChild(item);
    }
  }

  // ── Inline join prompt ────────────────────────────────────────────────────
  function showInlineJoin(item, lobby, isFull) {
    inlineJoinActive = true;
    const joinArea = item.querySelector('.join-area');

    // Replace with inline form — count badge + input + confirm + cancel
    joinArea.innerHTML = `
      <input class="join-nick-input" type="text"
        value="${escHtml(playerDisplayName)}"
        placeholder="Nickname" maxlength="20"
        autocomplete="nickname">
      <button class="join-icon-btn confirm" title="Join">✓</button>
      <button class="join-icon-btn cancel"  title="Cancel">✕</button>`;

    const nickInput  = joinArea.querySelector('.join-nick-input');
    const confirmBtn = joinArea.querySelector('.join-icon-btn.confirm');
    const cancelBtn  = joinArea.querySelector('.join-icon-btn.cancel');

    // Focus and select the pre-filled name so the user can type over it
    nickInput.focus();
    nickInput.select();

    function doJoin() {
      const nick = nickInput.value.trim() || playerDisplayName || 'Player';
      socket.emit('lobby:join', {
        joinCode:    lobby.joinCode,
        playerName:  nick,
        pin:         '',
        asSpectator: isFull,
      });
      inlineJoinActive = false;
    }

    function doCancel() {
      inlineJoinActive = false;
      renderLobbyList(currentPanelGame);
    }

    confirmBtn.addEventListener('click', doJoin);
    cancelBtn.addEventListener('click', doCancel);
    nickInput.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); doJoin(); }
      if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
    });
  }

  // ── Button wiring ─────────────────────────────────────────────────────────
  backBtn.addEventListener('click', hideLobbyPanel);
  createBtn.addEventListener('click', () => openCreateModal(currentPanelGame || ''));

  // Auto-open join modal for ?join=CODE in URL
  if (prefillCode) {
    setTimeout(() => openJoinModal(prefillCode, false), 150);
  }

  // ── Create modal ──────────────────────────────────────────────────────────
  function openCreateModal(defaultGameType) {
    if (mpView.querySelector('.gc-modal-backdrop')) return;

    const gameLabel      = gameMeta[defaultGameType]?.label || defaultGameType || '';
    const defaultLobName = gameLabel ? `${gameLabel} Lobby` : 'My Lobby';

    const gameOptions = gamesList.map(g =>
      `<option value="${escHtml(g.gameType)}"${g.gameType === defaultGameType ? ' selected' : ''}>${escHtml(g.label)}</option>`
    ).join('') || '<option value="">No games available</option>';

    const backdrop = document.createElement('div');
    backdrop.className = 'gc-modal-backdrop';
    backdrop.innerHTML = `
      <div class="gc-modal" id="gc-create-modal">
        <div class="gc-modal-handle"></div>

        <!-- Header row: ← BACK + title -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
          <button id="cm-back" style="${BACK_BTN_STYLE}">← BACK</button>
          <div class="gc-modal-title" style="margin:0;flex:1">Create a Lobby</div>
        </div>

        <div class="gc-modal-fields">
          <div>
            <label class="gc-label">Lobby Name</label>
            <input class="gc-input" id="cm-lobby-name" type="text"
              placeholder="Name your lobby" maxlength="40"
              value="${escHtml(defaultLobName)}">
          </div>
          <div>
            <label class="gc-label">Your Nickname</label>
            <input class="gc-input" id="cm-nickname" type="text"
              placeholder="Nickname for this lobby" maxlength="20"
              value="${escHtml(playerDisplayName)}">
          </div>
          <div>
            <label class="gc-label">Game</label>
            <select class="gc-input gc-select" id="cm-game">${gameOptions}</select>
          </div>
          <div id="cm-bot-info" class="gc-section-label" style="display:none;font-size:0.67rem;padding:6px 0"></div>
          <div id="cm-settings"></div>
        </div>

        <div class="gc-error-msg" id="cm-error"></div>
        <button class="gc-btn-gold" id="cm-submit">Create Lobby</button>
      </div>`;

    mpView.appendChild(backdrop);

    const cmGame     = backdrop.querySelector('#cm-game');
    const cmSettings = backdrop.querySelector('#cm-settings');
    const cmBotInfo  = backdrop.querySelector('#cm-bot-info');
    const cmError    = backdrop.querySelector('#cm-error');

    function updateCmSettings() {
      const gt  = cmGame.value;
      const meta = gameMeta[gt];
      const cfg  = gameConfigs[gt] || [];
      if (meta?.botFillAllowed) {
        cmBotInfo.style.display = 'flex';
        cmBotInfo.textContent   = `Bots fill automatically to ${meta.botFillMin} players`;
      } else {
        cmBotInfo.style.display = 'none';
      }
      if (!cfg.length) { cmSettings.innerHTML = ''; return; }
      cmSettings.innerHTML = cfg.map(field => {
        if (field.type === 'number') {
          return `<div>
            <label class="gc-label">${escHtml(field.label)}</label>
            <input class="gc-input" id="cms-${escHtml(field.key)}" type="number"
              value="${field.default ?? 0}" min="${field.min ?? 0}" step="${field.step || 1}">
          </div>`;
        }
        if (field.type === 'select') {
          const opts = (field.options || []).map(v =>
            `<option value="${escHtml(v)}"${v === field.default ? ' selected' : ''}>${escHtml(v)}</option>`
          ).join('');
          return `<div>
            <label class="gc-label">${escHtml(field.label)}</label>
            <select class="gc-input gc-select" id="cms-${escHtml(field.key)}">${opts}</select>
          </div>`;
        }
        if (field.type === 'boolean') {
          return `<div style="display:flex;align-items:center;gap:10px;padding:4px 0">
            <input type="checkbox" id="cms-${escHtml(field.key)}"${field.default ? ' checked' : ''} style="width:auto;accent-color:var(--gc-gold)">
            <label class="gc-label" for="cms-${escHtml(field.key)}" style="margin:0;text-transform:none;letter-spacing:0">${escHtml(field.label)}</label>
          </div>`;
        }
        return '';
      }).join('');
    }

    if (gamesList.length) updateCmSettings();
    cmGame.addEventListener('change', () => { updateCmSettings(); });

    // ESC closes modal — self-removing listener
    let modalEsc = null;
    function closeCreateModal() {
      closeModal(backdrop);
      if (modalEsc) { document.removeEventListener('keydown', modalEsc); modalEsc = null; }
    }
    modalEsc = e => { if (e.key === 'Escape') closeCreateModal(); };
    document.addEventListener('keydown', modalEsc);

    backdrop.querySelector('#cm-back').addEventListener('click', closeCreateModal);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeCreateModal(); });

    backdrop.querySelector('#cm-submit').addEventListener('click', () => {
      const gt         = cmGame.value;
      const nickname   = backdrop.querySelector('#cm-nickname').value.trim() || playerDisplayName || 'Player';
      const lobbyName  = backdrop.querySelector('#cm-lobby-name').value.trim() || defaultLobName || 'My Lobby';
      if (!gt) { showModalError(cmError, 'Please select a game.'); return; }
      cmError.style.display = 'none';
      const settings = collectSettings(backdrop, gt);
      socket.emit('lobby:create', {
        gameType:   gt,
        playerName: nickname,
        lobbyName:  lobbyName,
        pin:        '',
        settings:   settings,
      });
      closeCreateModal();
    });
  }

  // ── Join modal (URL prefill path — simplified to nickname + code) ──────────
  function openJoinModal(prefillCodeArg = '', asSpectate = false) {
    if (mpView.querySelector('.gc-modal-backdrop')) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'gc-modal-backdrop';
    backdrop.innerHTML = `
      <div class="gc-modal" id="gc-join-modal">
        <div class="gc-modal-handle"></div>
        <div class="gc-modal-title">${asSpectate ? 'Watch a Lobby' : 'Join a Lobby'}</div>
        <div class="gc-modal-fields">
          <div>
            <label class="gc-label">Your Nickname</label>
            <input class="gc-input" id="jm-nickname" type="text"
              placeholder="Nickname for this lobby" maxlength="20"
              value="${escHtml(playerDisplayName)}">
          </div>
          <div>
            <label class="gc-label">Join Code</label>
            <input class="gc-input" id="jm-code" type="text" placeholder="e.g. AB3X" maxlength="4"
              value="${escHtml(prefillCodeArg)}"
              style="text-transform:uppercase;letter-spacing:4px;font-size:1.1rem;font-weight:700;text-align:center">
          </div>
        </div>
        <div class="gc-error-msg" id="jm-error"></div>
        <button class="gc-btn-gold" id="jm-submit">${asSpectate ? 'Watch' : 'Join Lobby'}</button>
        <button class="gc-btn-ghost" id="jm-cancel" style="margin-top:10px">Cancel</button>
      </div>`;

    mpView.appendChild(backdrop);

    const jmCode  = backdrop.querySelector('#jm-code');
    const jmError = backdrop.querySelector('#jm-error');
    jmCode.addEventListener('input', () => { jmCode.value = jmCode.value.toUpperCase(); });

    backdrop.querySelector('#jm-submit').addEventListener('click', () => {
      const code = jmCode.value.trim().toUpperCase();
      if (!code || code.length < 2) { showModalError(jmError, 'Please enter a valid join code.'); return; }
      const nick = backdrop.querySelector('#jm-nickname').value.trim() || playerDisplayName || 'Player';
      jmError.style.display = 'none';
      socket.emit('lobby:join', {
        joinCode:    code,
        playerName:  nick,
        pin:         '',
        asSpectator: asSpectate,
      });
      closeModal(backdrop);
    });

    backdrop.querySelector('#jm-cancel').addEventListener('click', () => closeModal(backdrop));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(backdrop); });
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function closeModal(backdrop) { backdrop.remove(); }

  function showModalError(el, msg) {
    el.textContent = msg;
    el.style.display = 'block';
  }

  function collectSettings(root, gameType) {
    const config   = gameConfigs[gameType] || [];
    const settings = {};
    for (const field of config) {
      const el = root.querySelector(`#cms-${field.key}`);
      if (!el) continue;
      if (field.type === 'number')      settings[field.key] = parseFloat(el.value) || field.default || 0;
      else if (field.type === 'select') settings[field.key] = el.value;
      else if (field.type === 'boolean')settings[field.key] = el.checked;
    }
    return settings;
  }

  // ── Socket error ──────────────────────────────────────────────────────────
  function onError(code, message) {
    const modal = mpView.querySelector('.gc-modal-backdrop');
    if (modal) {
      const errEl = modal.querySelector('.gc-error-msg');
      if (errEl) showModalError(errEl, message);
    }
  }

  return {
    onError,
    destroy() {
      clearInterval(pollTimer);
      removePanelEsc();
    },
  };
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
