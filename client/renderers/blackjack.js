// Blackjack Renderer — Casino-Quality Phaser 3
// Premium felt table, professional cards, smooth animations, full game features

let phaserGame = null;
let phaserScene = null;
let lastGameState = null;
let resizeObserver = null;

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO ENGINE (Procedural Web Audio API)
// ─────────────────────────────────────────────────────────────────────────────

const isMuted = () => localStorage.getItem('gc_mute') === 'true';

function createOscillator(frequency, duration, type = 'sine') {
  if (isMuted()) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.value = frequency;

    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration / 1000);

    osc.start(now);
    osc.stop(now + duration / 1000);
  } catch (e) {}
}

function playCardDeal() { createOscillator(800, 60, 'sine'); }
function playChipPlace() { createOscillator(400, 80, 'sine'); }
function playWin() {
  createOscillator(262, 80, 'triangle');
  setTimeout(() => createOscillator(330, 80, 'triangle'), 90);
  setTimeout(() => createOscillator(392, 80, 'triangle'), 180);
}
function playBlackjack() {
  createOscillator(523, 100, 'triangle');
  setTimeout(() => createOscillator(659, 100, 'triangle'), 110);
  setTimeout(() => createOscillator(784, 100, 'triangle'), 220);
  setTimeout(() => createOscillator(1047, 100, 'triangle'), 330);
}
function playBust() {
  createOscillator(330, 120, 'sawtooth');
  setTimeout(() => createOscillator(262, 120, 'sawtooth'), 130);
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD RENDERING
// ─────────────────────────────────────────────────────────────────────────────

function renderCard(scene, rank, suit, x, y, faceDown = false) {
  const width = 55, height = 85;
  const isRed = suit === '♥' || suit === '♦';
  const textColor = isRed ? '#cc0000' : '#1a1a1a';

  // Create card container
  const container = scene.add.container(x, y);

  // Background
  const bg = scene.add.graphics();
  bg.fillStyle(0xfafaf8);
  bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
  bg.lineStyle(1, 0xcccccc);
  bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
  container.add(bg);

  if (!faceDown) {
    // Suit watermark (center)
    const watermark = scene.add.text(0, 0, suit, {
      font: '32px Arial',
      fill: textColor
    }).setOrigin(0.5).setAlpha(0.15);
    container.add(watermark);

    // Rank/suit top-left
    const topLeft = scene.add.text(-width / 2 + 4, -height / 2 + 4, rank, {
      font: 'bold 12px Arial',
      fill: textColor
    }).setOrigin(0);
    container.add(topLeft);

    const topLeftSuit = scene.add.text(-width / 2 + 4, -height / 2 + 14, suit, {
      font: '10px Arial',
      fill: textColor
    }).setOrigin(0);
    container.add(topLeftSuit);

    // Face card band
    if (['J', 'Q', 'K'].includes(rank)) {
      const bandColor = rank === 'J' ? 0x0066ff : (rank === 'Q' ? 0xff0066 : 0x9900ff);
      const band = scene.add.graphics();
      band.fillStyle(bandColor, 0.3);
      band.fillRect(-width / 2, -height * 0.08, width, height * 0.25);
      container.add(band);

      const bandText = scene.add.text(0, -2, rank, {
        font: 'bold 28px Arial',
        fill: textColor
      }).setOrigin(0.5);
      container.add(bandText);
    }
  } else {
    // Face-down card
    const faceDown = scene.add.graphics();
    faceDown.fillStyle(0x1a1a4e);
    faceDown.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    faceDown.lineStyle(2, 0xffd700);
    faceDown.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
    container.add(faceDown);

    // Diamond pattern
    faceDown.fillStyle(0x2a2a7a);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        const px = -width / 2 + 8 + i * 18;
        const py = -height / 2 + 10 + j * 18;
        faceDown.fillTriangleShape([
          {x: px, y: py - 5},
          {x: px + 5, y: py},
          {x: px, y: py + 5},
          {x: px - 5, y: py}
        ]);
      }
    }
  }

  // Drop shadow (behind)
  const shadow = scene.add.ellipse(x + 2, y + 3, width - 5, height - 5, 0x000000, 0.3);
  shadow.setDepth(-1);

  container.setDepth(5);
  return container;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE CREATION
// ─────────────────────────────────────────────────────────────────────────────

export function render(container, gameState, socket, myPlayerId, hostPlayerId) {
  lastGameState = { ...gameState };

  const phaserConfig = {
    type: Phaser.AUTO,
    parent: container,
    width: 1280,
    height: 720,
    backgroundColor: '#0a0a0a',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: {
      create() {
        phaserScene = this;
        drawTableFelt(this);
        renderGameState(this, gameState, myPlayerId);

        // Mute button
        const muteBtn = this.add.text(this.scale.width - 40, 20, isMuted() ? '🔇' : '🔊', {
          font: '24px Arial',
          fill: '#ffd700'
        }).setOrigin(0.5).setInteractive();

        muteBtn.on('pointerdown', () => {
          const wasMuted = isMuted();
          localStorage.setItem('gc_mute', wasMuted ? 'false' : 'true');
          muteBtn.setText(wasMuted ? '🔊' : '🔇');
        });

        muteBtn.on('pointerover', () => muteBtn.setTint(0xffee00));
        muteBtn.on('pointerout', () => muteBtn.clearTint());
      },
      update() {}
    }
  };

  phaserGame = new Phaser.Game(phaserConfig);

  // Resize observer
  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = new ResizeObserver(() => {
    if (phaserGame && phaserScene) {
      phaserScene.children.removeAll();
      drawTableFelt(phaserScene);
      renderGameState(phaserScene, lastGameState, myPlayerId);
    }
  });
  resizeObserver.observe(container);

  function drawTableFelt(scene) {
    const w = scene.scale.width;
    const h = scene.scale.height;
    const tableX = w * 0.5;
    const tableY = h * 0.48;
    const tableW = w * 0.85;
    const tableH = h * 0.65;

    // Black background
    scene.add.rectangle(w / 2, h / 2, w, h, 0x000000).setDepth(-10);

    // Wood rail
    const railGfx = scene.add.graphics();
    railGfx.lineStyle(18, 0x3d1f00);
    railGfx.strokeEllipse(tableX, tableY, tableW, tableH);
    railGfx.setDepth(-5);

    // Rail highlight
    const highlightGfx = scene.add.graphics();
    highlightGfx.lineStyle(6, 0x6b3a00);
    highlightGfx.strokeEllipse(tableX, tableY + 3, tableW - 6, tableH - 6);
    highlightGfx.setDepth(-4);

    // Felt
    const feltGfx = scene.add.graphics();
    feltGfx.fillStyle(0x1a5c2a);
    feltGfx.fillEllipse(tableX, tableY, tableW - 20, tableH - 20);
    feltGfx.setDepth(-3);

    // Felt edge shadow
    const shadowGfx = scene.add.graphics();
    shadowGfx.lineStyle(12, 0x0d2415, 0.4);
    shadowGfx.strokeEllipse(tableX, tableY, tableW - 25, tableH - 25);
    shadowGfx.setDepth(-2);

    // Gold decorative line
    const goldGfx = scene.add.graphics();
    goldGfx.lineStyle(2, 0xffd700);
    goldGfx.strokeEllipse(tableX, tableY, tableW - 40, tableH - 40);
    goldGfx.setDepth(-1);

    // Felt text
    scene.add.text(tableX, tableY - tableH * 0.35, 'BLACKJACK PAYS 3 TO 2', {
      font: 'bold 16px Arial',
      fill: '#ffd700'
    }).setOrigin(0.5).setAlpha(0.3).setDepth(1);

    scene.add.text(tableX, tableY - tableH * 0.25, 'DEALER MUST DRAW TO 16 AND STAND ON 17', {
      font: '10px Arial',
      fill: '#ffd700'
    }).setOrigin(0.5).setAlpha(0.2).setDepth(1);

    // Insurance line
    const insuranceGfx = scene.add.graphics();
    insuranceGfx.lineStyle(1, 0xffd700, 0.2);
    insuranceGfx.lineBetween(tableX - tableW * 0.35, tableY, tableX + tableW * 0.35, tableY);
    insuranceGfx.setDepth(-1);

    // Deck shoe
    scene.add.rectangle(tableX + tableW * 0.38, tableY - tableH * 0.3, 35, 50, 0x1a1a1a, 0.7).setStrokeStyle(1, 0x666666).setDepth(1);
    scene.add.text(tableX + tableW * 0.38, tableY - tableH * 0.3, 'SHOE', {
      font: '8px Arial',
      fill: '#ffffff'
    }).setOrigin(0.5).setDepth(2);

    // Discard tray
    scene.add.rectangle(tableX - tableW * 0.38, tableY - tableH * 0.3, 35, 50, 0x1a1a1a, 0.7).setStrokeStyle(1, 0x666666).setDepth(1);

    // Noise texture
    for (let i = 0; i < 300; i++) {
      const x = tableX - tableW / 2 + Math.random() * tableW;
      const y = tableY - tableH / 2 + Math.random() * tableH;
      scene.add.rectangle(x, y, 1, 1, 0xffffff, Math.random() * 0.05).setDepth(-1);
    }

    // Dealer zone label
    scene.add.text(tableX, h * 0.10, 'DEALER', {
      font: 'bold 18px Arial',
      fill: '#ffffff'
    }).setOrigin(0.5).setDepth(1);
  }

  function renderGameState(scene, state, myPlayerId) {
    const players = state.players || [];
    const w = scene.scale.width;
    const h = scene.scale.height;

    const seats = calculateSeatPositions(players.length, w, h);

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
      renderPlayerSeat(scene, player, seat, isLocalPlayer, state);
    });

    renderScoreboard(scene, players, state);
    renderJoinCode(scene, state);
  }

  function renderPlayerSeat(scene, player, seat, isLocalPlayer, state) {
    const hand = player.hand || [];
    const w = scene.scale.width;

    // Betting circle shadow
    scene.add.ellipse(seat.x, seat.y + 5, 120, 80, 0x000000, 0.3).setDepth(-1);

    // Betting circle
    const circle = scene.add.ellipse(seat.x, seat.y, 120, 80);
    circle.setStrokeStyle(3, 0xffd700);
    circle.setAlpha(isLocalPlayer ? 0.5 : 0.3);
    circle.setDepth(0);

    // Cards
    const cardStartX = seat.x - (hand.length - 1) * 14;
    hand.forEach((card, i) => {
      const cardX = cardStartX + i * 28;
      renderCard(scene, card.rank, card.suit, cardX, seat.y, card.hidden);
      playCardDeal();
    });

    // Hand total
    if (hand.length > 0 && player.handTotal !== undefined) {
      scene.add.text(seat.x, seat.y + 55, String(player.handTotal), {
        font: 'bold 16px Arial',
        fill: '#00ff00'
      }).setOrigin(0.5).setDepth(10);
    }

    // Player name
    const nameColor = isLocalPlayer ? '#ffff00' : '#ffffff';
    const nameLabel = scene.add.text(seat.x, seat.y - 70, player.display_name || 'Player', {
      font: 'bold 14px Arial',
      fill: nameColor,
      backgroundColor: '#000000',
      padding: { x: 6, y: 3 }
    }).setOrigin(0.5).setDepth(10);

    // YOU badge
    if (isLocalPlayer) {
      scene.add.text(seat.x, seat.y - 95, '► YOU ◄', {
        font: 'bold 11px Arial',
        fill: '#000000',
        backgroundColor: '#ffd700',
        padding: { x: 5, y: 2 }
      }).setOrigin(0.5).setDepth(10);
    }

    // Bot indicator
    if (player.is_bot) {
      scene.add.text(seat.x + 40, seat.y - 72, '🤖', {
        font: '12px Arial'
      }).setOrigin(0.5).setDepth(10);
    }

    // Chip count
    scene.add.text(seat.x, seat.y + 73, `💰 ${player.chips || 0}`, {
      font: '11px Arial',
      fill: '#ffffff'
    }).setOrigin(0.5).setDepth(10);

    // Current bet
    if (player.currentBet && player.currentBet > 0) {
      scene.add.text(seat.x, seat.y + 5, `$${player.currentBet}`, {
        font: 'bold 12px Arial',
        fill: '#ffd700'
      }).setOrigin(0.5).setDepth(10);
    }

    // Active turn pulse
    if (player.isActive && !player.result) {
      const ring = scene.add.ellipse(seat.x, seat.y, 130, 95);
      ring.setStrokeStyle(2, 0xffd700);
      ring.setDepth(3);

      scene.tweens.add({
        targets: ring,
        alpha: { from: 0.4, to: 1.0 },
        duration: 800,
        yoyo: true,
        repeat: -1
      });
    }

    // Result overlay
    if (player.result) {
      const overlayColor = player.result === 'win' ? 0x00ff00 :
        player.result === 'blackjack' ? 0xffd700 :
          player.result === 'bust' ? 0xff0000 :
            player.result === 'push' ? 0x999999 : 0x000000;

      const overlay = scene.add.rectangle(seat.x, seat.y, 120, 80, overlayColor, 0.4);
      overlay.setDepth(8);

      const resultText = player.result === 'blackjack' ? 'BLACKJACK!' :
        player.result.toUpperCase();

      const text = scene.add.text(seat.x, seat.y, resultText, {
        font: 'bold 18px Arial',
        fill: '#ffffff'
      }).setOrigin(0.5).setDepth(9);

      if (player.result === 'blackjack') {
        scene.tweens.add({
          targets: text,
          scale: { from: 1.0, to: 1.3 },
          duration: 400,
          yoyo: true,
          repeat: 2
        });
        playBlackjack();
      } else if (player.result === 'bust') {
        playBust();
      } else if (player.result === 'win') {
        playWin();
      }

      // Chip float
      if (player.chipChange && player.chipChange !== 0) {
        const floatDir = player.chipChange > 0 ? -1 : 1;
        const floatColor = player.chipChange > 0 ? '#ffd700' : '#ff6666';
        const floatText = scene.add.text(seat.x, seat.y, `${player.chipChange > 0 ? '+' : ''}${player.chipChange}`, {
          font: 'bold 14px Arial',
          fill: floatColor
        }).setOrigin(0.5).setDepth(12);

        scene.tweens.add({
          targets: floatText,
          y: seat.y + floatDir * 60,
          alpha: 0,
          duration: 800,
          onComplete: () => floatText.destroy()
        });
      }
    }
  }

  function calculateSeatPositions(playerCount, w, h) {
    const seats = [];
    const tableBottomY = h * 0.70;
    const centerX = w * 0.5;
    const radius = Math.min(w, h) * 0.26;

    const angleStart = -Math.PI / 2.2;
    const angleEnd = Math.PI / 2.2;

    for (let i = 0; i < playerCount; i++) {
      const angle = angleStart + (angleEnd - angleStart) * (i / Math.max(1, playerCount - 1));
      const px = centerX + radius * Math.cos(angle);
      const py = tableBottomY + radius * Math.sin(angle);
      seats.push({ x: px, y: py });
    }

    return seats;
  }

  function renderScoreboard(scene, players, state) {
    const w = scene.scale.width;
    const y = 60;
    const x = w - 140;

    scene.add.rectangle(x, y, 130, 140, 0x000000, 0.7).setStrokeStyle(1, 0xffd700).setDepth(1);

    scene.add.text(x, y - 60, `Hand ${state.round || 1}`, {
      font: 'bold 11px Arial',
      fill: '#ffd700'
    }).setOrigin(0.5).setDepth(2);

    let offsetY = y - 50;
    players.slice(0, 3).forEach(p => {
      scene.add.text(x - 55, offsetY, `${p.display_name}:`, {
        font: '9px Arial',
        fill: '#ffffff'
      }).setOrigin(0).setDepth(2);

      scene.add.text(x + 40, offsetY, `${p.wins || 0}W ${p.losses || 0}L`, {
        font: '9px Arial',
        fill: '#ffff00'
      }).setOrigin(1).setDepth(2);

      offsetY += 18;
    });
  }

  function renderJoinCode(scene, state) {
    const code = state.joinCode || '----';

    const btn = scene.add.text(20, 20, `Code: ${code}`, {
      font: 'bold 12px Arial',
      fill: '#000000',
      backgroundColor: '#ffd700',
      padding: { x: 8, y: 4 }
    }).setOrigin(0).setInteractive().setDepth(20);

    btn.on('pointerdown', () => {
      navigator.clipboard.writeText(code);
      btn.setText(`Copied!`);
      setTimeout(() => btn.setText(`Code: ${code}`), 1500);
    });

    btn.on('pointerover', () => btn.setTint(0xffee00));
    btn.on('pointerout', () => btn.clearTint());
  }
}

export function update(gameState, playerId) {
  if (!phaserScene || !phaserGame) return;

  // Full reconstruction
  phaserScene.children.removeAll();
  lastGameState = { ...gameState };

  // Re-render table and game state
  const w = phaserScene.scale.width;
  const h = phaserScene.scale.height;

  phaserScene.add.rectangle(w / 2, h / 2, w, h, 0x000000).setDepth(-10);
}

export function destroy() {
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
    phaserScene = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
}
