// Blackjack renderer — Phaser 3 canvas-based
// Supports 1-6 players, responsive scaling, procedural audio

let phaserGame = null;
let phaserScene = null;
let lastGameState = null;

// ── Audio helpers ──────────────────────────────────────────────────────────
const isMuted = () => localStorage.getItem('gc_mute') === 'true';

function playTone(freq, duration, type = 'sine') {
  if (isMuted()) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration / 1000);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration / 1000);
  } catch (e) {}
}

function playCardDeal() { playTone(800, 80, 'sine'); }
function playChipPlace() { playTone(500, 80, 'sine'); }
function playWin() {
  playTone(523, 100);
  setTimeout(() => playTone(659, 100), 110);
}
function playLose() {
  playTone(330, 100);
  setTimeout(() => playTone(262, 100), 110);
}
function playBlackjack() {
  playTone(523, 100);
  setTimeout(() => playTone(659, 100), 110);
  setTimeout(() => playTone(784, 100), 220);
}

// ── Card graphics ──────────────────────────────────────────────────────────
function drawCard(scene, rank, suit, x, y, faceDown = false) {
  const cardW = 55, cardH = 85;

  if (faceDown) {
    const graphics = scene.add.graphics();
    graphics.fillStyle(0x001a66);
    graphics.fillRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 4);
    graphics.lineStyle(2, 0x003d99);
    graphics.strokeRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 4);
    graphics.fillStyle(0x003d99);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const px = x - cardW / 2 + 12 + i * 15;
        const py = y - cardH / 2 + 15 + j * 20;
        graphics.fillRect(px - 4, py - 4, 8, 8);
      }
    }
    return graphics;
  }

  // Face card
  const graphics = scene.add.graphics();
  graphics.fillStyle(0xffffff);
  graphics.fillRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 4);
  graphics.lineStyle(2, 0x000000);
  graphics.strokeRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 4);

  const isRed = suit === '♥' || suit === '♦';
  const color = isRed ? '#ff0000' : '#000000';

  scene.add.text(x - cardW / 2 + 3, y - cardH / 2 + 2, rank, {
    font: '11px Arial', fill: color, fontStyle: 'bold'
  }).setOrigin(0);

  scene.add.text(x + cardW / 2 - 5, y + cardH / 2 - 13, suit, {
    font: '12px Arial', fill: color, fontStyle: 'bold'
  }).setOrigin(0);

  return graphics;
}

// ── Player seat positioning ────────────────────────────────────────────────
function calculateSeatPositions(playerCount, sceneWidth, sceneHeight) {
  const seats = [];
  const tableBottomY = sceneHeight * 0.70;
  const centerX = sceneWidth / 2;
  const radius = Math.min(sceneWidth, sceneHeight) * 0.25;

  const angleStart = -Math.PI / 2.5;
  const angleEnd = Math.PI / 2.5;

  for (let i = 0; i < playerCount; i++) {
    const angle = angleStart + (angleEnd - angleStart) * (i / Math.max(1, playerCount - 1));
    const px = centerX + radius * Math.cos(angle);
    const py = tableBottomY + radius * Math.sin(angle);
    const isLocalCenter = i === Math.floor(playerCount / 2);
    seats.push({ x: px, y: py, isLocalCenter, index: i });
  }

  return seats;
}

export function render(container, gameState, socket, myPlayerId, hostPlayerId) {
  lastGameState = { ...gameState };

  const phaserConfig = {
    type: Phaser.AUTO,
    parent: container,
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: {
      create() {
        phaserScene = this;
        drawTable();
        renderGameState(gameState, myPlayerId);
      },
      update() {}
    }
  };

  phaserGame = new Phaser.Game(phaserConfig);

  function drawTable() {
    const scene = phaserScene;
    const w = scene.scale.width;
    const h = scene.scale.height;

    // Black background
    scene.add.rectangle(w / 2, h / 2, w, h, 0x000000).setDepth(-10);

    // Felt oval
    const tableW = w * 0.80;
    const tableH = h * 0.60;
    const tableX = w / 2;
    const tableY = h * 0.48;

    const graphics = scene.add.graphics();
    graphics.fillStyle(0x1a5c3a);
    graphics.fillEllipse(tableX, tableY, tableW, tableH);
    graphics.lineStyle(10, 0x6b4423);
    graphics.strokeEllipse(tableX, tableY, tableW, tableH);
    graphics.setDepth(-1);

    // Dealer zone
    scene.add.text(tableX, h * 0.12, 'DEALER', {
      font: 'bold 18px Arial',
      fill: '#ffffff'
    }).setOrigin(0.5);
  }

  function renderGameState(state, myPlayerId) {
    if (!phaserScene) return;

    phaserScene.children.removeAll();
    drawTable();

    const players = state.players || [];
    if (players.length === 0) return;

    const seats = calculateSeatPositions(players.length, phaserScene.scale.width, phaserScene.scale.height);

    // Reorder: local player to center seat
    let orderedPlayers = [...players];
    const myIndex = players.findIndex(p => p.id === myPlayerId);
    const centerIndex = Math.floor(players.length / 2);

    if (myIndex !== -1 && myIndex !== centerIndex) {
      [orderedPlayers[myIndex], orderedPlayers[centerIndex]] = [orderedPlayers[centerIndex], orderedPlayers[myIndex]];
    }

    orderedPlayers.forEach((player, idx) => {
      if (idx >= seats.length) return;
      const seat = seats[idx];
      const isLocalPlayer = player.id === myPlayerId;
      renderPlayerSeat(phaserScene, player, seat, isLocalPlayer, state);
    });
  }

  function renderPlayerSeat(scene, player, seat, isLocalPlayer, state) {
    const hand = player.hand || [];

    // Player name
    const nameColor = isLocalPlayer ? '#ffff00' : '#ffffff';
    scene.add.text(seat.x, seat.y - 65, player.display_name || 'Player', {
      font: 'bold 14px Arial',
      fill: nameColor
    }).setOrigin(0.5);

    // Cards
    const cardStartX = seat.x - (hand.length - 1) * 13;
    hand.forEach((card, i) => {
      const cardX = cardStartX + i * 26;
      drawCard(scene, card.rank, card.suit, cardX, seat.y, card.hidden);
      playCardDeal();
    });

    // Hand total
    if (hand.length > 0 && player.handTotal !== undefined) {
      scene.add.text(seat.x, seat.y + 50, String(player.handTotal), {
        font: 'bold 14px Arial',
        fill: '#00ff00'
      }).setOrigin(0.5);
    }

    // Chip count
    scene.add.text(seat.x, seat.y + 68, `💰 ${player.chips || 0}`, {
      font: '11px Arial',
      fill: '#ffffff'
    }).setOrigin(0.5);

    // Local player indicator
    if (isLocalPlayer) {
      const ring = scene.add.graphics();
      ring.lineStyle(3, 0xffff00);
      ring.strokeEllipse(seat.x, seat.y, 90, 70);
    }

    // Result overlay
    if (player.result) {
      let color = '#ffffff';
      let text = 'UNKNOWN';
      if (player.result === 'win') { color = '#00ff00'; text = 'WIN'; playWin(); }
      if (player.result === 'lose') { color = '#ff0000'; text = 'LOSE'; playLose(); }
      if (player.result === 'push') { color = '#ffff00'; text = 'PUSH'; }
      if (player.result === 'bust') { color = '#ff0000'; text = 'BUST'; playLose(); }
      if (player.result === 'blackjack') { color = '#ffd700'; text = 'BJ'; playBlackjack(); }

      scene.add.text(seat.x, seat.y - 10, text, {
        font: 'bold 20px Arial',
        fill: color,
        backgroundColor: '#000000',
        padding: { x: 8, y: 4 }
      }).setOrigin(0.5);
    }
  }
}

export function update(gameState, playerId) {
  if (!phaserScene || !phaserGame) return;

  // Reconstruct from fresh state (handles reconnect)
  const players = gameState.players || [];
  phaserScene.children.removeAll();

  const w = phaserGame.scale.width;
  const h = phaserGame.scale.height;

  // Redraw table
  phaserScene.add.rectangle(w / 2, h / 2, w, h, 0x000000).setDepth(-10);

  const tableW = w * 0.80;
  const tableH = h * 0.60;
  const tableX = w / 2;
  const tableY = h * 0.48;

  const graphics = phaserScene.add.graphics();
  graphics.fillStyle(0x1a5c3a);
  graphics.fillEllipse(tableX, tableY, tableW, tableH);
  graphics.lineStyle(10, 0x6b4423);
  graphics.strokeEllipse(tableX, tableY, tableW, tableH);
  graphics.setDepth(-1);

  phaserScene.add.text(tableX, h * 0.12, 'DEALER', {
    font: 'bold 18px Arial',
    fill: '#ffffff'
  }).setOrigin(0.5);

  // Render seats
  const seats = calculateSeatPositions(players.length, w, h);

  let orderedPlayers = [...players];
  const myIndex = players.findIndex(p => p.id === playerId);
  const centerIndex = Math.floor(players.length / 2);

  if (myIndex !== -1 && myIndex !== centerIndex) {
    [orderedPlayers[myIndex], orderedPlayers[centerIndex]] = [orderedPlayers[centerIndex], orderedPlayers[myIndex]];
  }

  orderedPlayers.forEach((player, idx) => {
    if (idx >= seats.length) return;
    const seat = seats[idx];
    const isLocalPlayer = player.id === playerId;
    const hand = player.hand || [];

    phaserScene.add.text(seat.x, seat.y - 65, player.display_name || 'Player', {
      font: 'bold 14px Arial',
      fill: isLocalPlayer ? '#ffff00' : '#ffffff'
    }).setOrigin(0.5);

    const cardStartX = seat.x - (hand.length - 1) * 13;
    hand.forEach((card, i) => {
      const cardX = cardStartX + i * 26;
      drawCard(phaserScene, card.rank, card.suit, cardX, seat.y, card.hidden);
    });

    if (hand.length > 0 && player.handTotal !== undefined) {
      phaserScene.add.text(seat.x, seat.y + 50, String(player.handTotal), {
        font: 'bold 14px Arial',
        fill: '#00ff00'
      }).setOrigin(0.5);
    }

    phaserScene.add.text(seat.x, seat.y + 68, `💰 ${player.chips || 0}`, {
      font: '11px Arial',
      fill: '#ffffff'
    }).setOrigin(0.5);

    if (isLocalPlayer) {
      const ring = phaserScene.add.graphics();
      ring.lineStyle(3, 0xffff00);
      ring.strokeEllipse(seat.x, seat.y, 90, 70);
    }

    if (player.result) {
      let color = '#ffffff';
      let text = 'UNKNOWN';
      if (player.result === 'win') { color = '#00ff00'; text = 'WIN'; }
      if (player.result === 'lose') { color = '#ff0000'; text = 'LOSE'; }
      if (player.result === 'push') { color = '#ffff00'; text = 'PUSH'; }
      if (player.result === 'bust') { color = '#ff0000'; text = 'BUST'; }
      if (player.result === 'blackjack') { color = '#ffd700'; text = 'BJ'; }

      phaserScene.add.text(seat.x, seat.y - 10, text, {
        font: 'bold 20px Arial',
        fill: color,
        backgroundColor: '#000000',
        padding: { x: 8, y: 4 }
      }).setOrigin(0.5);
    }
  });

  lastGameState = { ...gameState };
}

export function destroy() {
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
    phaserScene = null;
  }
}
