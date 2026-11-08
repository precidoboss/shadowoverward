// UI, HUD & Navigation Management for Shadow Over Ward B
import { soundEngine } from './audio.js';
import { TAPES_DATABASE } from './story.js';

export class UIManager {
  constructor(game) {
    this.game = game;

    // DOM Elements
    this.hud = document.getElementById('camcorder-hud');
    this.crosshair = document.getElementById('crosshair');
    this.interactionPrompt = document.getElementById('interaction-prompt');
    this.objectiveText = document.getElementById('objective-text');
    this.waypointBeacon = document.getElementById('waypoint-beacon');
    this.objectiveArrow = document.getElementById('objective-arrow');
    this.guidePanel = document.getElementById('guide-panel');
    this.guideGoal = document.getElementById('guide-goal');
    this.guideChar = document.getElementById('guide-char');
    this.guideOpen = true;
    this.guideManual = false;
    this._guideChar = '';
    this._guideGoal = '';
    document.addEventListener('keydown', e => {
      if (e.code === 'KeyH' && !e.repeat && (this.game.state === 'PLAYING' || this.game.state === 'PAUSED')) this.toggleGuide();
    });
    this.notificationBanner = document.getElementById('notification-banner');
    this.timecodeElem = document.getElementById('cam-timecode');
    this.batteryFillElem = document.getElementById('cam-battery-fill');
    this.flashlightBarElem = document.getElementById('flashlight-bar');
    this.staminaBarElem = document.getElementById('stamina-bar');
    this.nightVisionLabel = document.getElementById('night-vision-status');
    this.zoomLabel = document.getElementById('zoom-status');

    // Menus & Modals
    this.mainMenu = document.getElementById('main-menu');
    this.pauseMenu = document.getElementById('pause-menu');
    this.settingsModal = document.getElementById('settings-modal');
    this.controlsModal = document.getElementById('controls-modal');
    this.inventoryModal = document.getElementById('inventory-modal');
    this.safeKeypadModal = document.getElementById('safe-keypad-modal');
    this.documentModal = document.getElementById('document-modal');
    this.vcrPlaybackModal = document.getElementById('vcr-playback-modal');
    this.mapModal = document.getElementById('map-modal');
    this.gameOverScreen = document.getElementById('game-over-screen');
    this.victoryScreen = document.getElementById('victory-screen');

    // Keypad state
    this.keypadCode = '';
    this.keypadTarget = '1974';

    // Playback state
    this.activeTapeTimer = null;

    this.bindEvents();
    this.bindDial();
  }

  bindEvents() {
    // Start button
    document.getElementById('btn-start-game').addEventListener('click', () => this.game.requestStart('full'));
    document.getElementById('btn-start-quick').addEventListener('click', () => this.game.requestStart('quick'));

    // Controls button
    document.getElementById('btn-controls').addEventListener('click', () => {
      this.controlsModal.classList.remove('hidden');
    });
    document.getElementById('btn-close-controls').addEventListener('click', () => {
      this.controlsModal.classList.add('hidden');
    });

    // Settings button
    document.getElementById('btn-settings').addEventListener('click', () => {
      this.settingsModal.classList.remove('hidden');
    });
    document.getElementById('btn-close-settings').addEventListener('click', () => {
      this.settingsModal.classList.add('hidden');
    });

    // Sliders
    const sensSlider = document.getElementById('slider-sensitivity');
    sensSlider.addEventListener('input', (e) => {
      if (this.game.player) {
        this.game.player.mouseSensitivity = parseFloat(e.target.value) * 0.001;
      }
    });

    const volSlider = document.getElementById('slider-volume');
    volSlider.addEventListener('input', (e) => {
      soundEngine.setVolume(parseFloat(e.target.value));
      soundEngine.ensureContext();
    });

    // Audio status button toggle & test chime
    const audioBtn = document.getElementById('hud-audio-status');
    if (audioBtn) {
      audioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        soundEngine.ensureContext();
        soundEngine.playStartupBeep();
        this.showBannerNotification("🔊 AUDIO UNMUTED & TESTED");
      });
    }

    // Resume button
    document.getElementById('btn-resume').addEventListener('click', () => {
      this.game.resumeGame();
    });

    // Retry button on Game Over
    document.getElementById('btn-retry').addEventListener('click', () => {
      this.game.restartGame();
    });

    // Restart button on Victory
    document.getElementById('btn-victory-restart').addEventListener('click', () => {
      this.game.restartGame();
    });

    // Map Close Button
    document.getElementById('btn-close-map').addEventListener('click', () => {
      this.closeMapModal();
    });

    // Keypad number buttons
    document.querySelectorAll('.keypad-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        soundEngine.playKeypadBeep();
        if (val === 'C') {
          this.keypadCode = '';
        } else if (val === 'E') {
          this.submitKeypad();
          return;
        } else {
          if (this.keypadCode.length < 4) {
            this.keypadCode += val;
          }
        }
        this.updateKeypadDisplay();
      });
    });

    document.getElementById('btn-close-keypad').addEventListener('click', () => {
      this.closeSafeKeypad();
    });

    // Document Modal Close
    document.getElementById('btn-close-doc').addEventListener('click', () => {
      this.closeDocumentModal();
    });

    // VCR Eject
    document.getElementById('btn-eject-tape').addEventListener('click', () => {
      this.stopTapePlayback();
    });

    // Inventory Close
    document.getElementById('btn-close-inv').addEventListener('click', () => {
      this.closeInventory();
    });

    // Global Key shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') {
        if (this.game.state === 'PLAYING') {
          e.preventDefault();
          this.openMapModal();
        } else if (this.game.state === 'MAP') {
          e.preventDefault();
          this.closeMapModal();
        }
      } else if (e.code === 'KeyI' || e.code === 'Tab') {
        if (this.game.state === 'PLAYING') {
          e.preventDefault();
          this.toggleInventory();
        } else if (this.game.state === 'INVENTORY') {
          e.preventDefault();
          this.closeInventory();
        }
      } else if (e.code === 'Escape') {
        if (this.game.state === 'PLAYING') {
          this.game.pauseGame();
        } else if (this.game.state === 'PAUSED') {
          this.game.resumeGame();
        } else if (this.game.state === 'MAP') {
          this.closeMapModal();
        } else if (this.game.state === 'KEYPAD') {
          this.closeSafeKeypad();
        } else if (this.game.state === 'DOCUMENT') {
          this.closeDocumentModal();
        } else if (this.game.state === 'PLAYING_TAPE') {
          this.stopTapePlayback();
        } else if (this.game.state === 'INVENTORY') {
          this.closeInventory();
        }
      } else if (e.code === 'KeyE') {
        if (this.game.state === 'PLAYING') {
          this.game.handlePlayerInteraction();
        }
      }
    });
  }

  showMainMenu() {
    this.mainMenu.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.pauseMenu.classList.add('hidden');
    this.gameOverScreen.classList.add('hidden');
    this.victoryScreen.classList.add('hidden');
  }

  hideMainMenu() {
    this.mainMenu.classList.add('hidden');
    this.hud.classList.remove('hidden');
    // Starting a run (including a retry) must also clear the end-of-run screens
    this.gameOverScreen.classList.add('hidden');
    this.victoryScreen.classList.add('hidden');
  }

  showPauseMenu() {
    this.pauseMenu.classList.remove('hidden');
  }

  hidePauseMenu() {
    this.pauseMenu.classList.add('hidden');
  }

  showGameOver() {
    this.hud.classList.add('hidden');
    this.gameOverScreen.classList.remove('hidden');
    soundEngine.playJumpStinger();
    soundEngine.playStaticBurst(1.8);
  }

  showVictory(stats) {
    this.hud.classList.add('hidden');
    this.victoryScreen.classList.remove('hidden');
    document.getElementById('victory-time').innerText = stats.timeString;
    document.getElementById('victory-tapes').innerText = `${stats.tapesCount} / 4`;
  }

  updateObjective(text) {
    if (this.objectiveText) {
      this.objectiveText.innerText = text;
    }
  }

  // Loading screen: shown until the investigator, Subject 407 and the infected staff are ready
  setLoadProgress(fraction, label) {
    const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
    const fill = document.getElementById('loading-fill');
    const text = document.getElementById('loading-text');
    if (fill) fill.style.width = `${pct}%`;
    if (text) text.innerText = `LOADING ${label}... ${pct}%`;
  }

  showLoading() {
    const screen = document.getElementById('loading-screen');
    if (screen) screen.classList.remove('hidden');
  }

  hideLoading() {
    const screen = document.getElementById('loading-screen');
    if (screen) screen.classList.add('hidden');
  }

  // Life bar and the current weapon
  updateVitals(health, maxHealth, weaponLabel) {
    const fill = document.getElementById('life-bar-fill');
    if (fill) {
      const frac = Math.max(0, health / maxHealth);
      fill.style.width = `${Math.round(frac * 100)}%`;
      fill.style.background = frac < 0.3 ? '#ff3333' : '#33dd66';
    }
    const weapon = document.getElementById('weapon-status');
    if (weapon && weaponLabel !== this._weaponLabel) {
      this._weaponLabel = weaponLabel;
      weapon.innerText = `WEAPON: ${weaponLabel}`;
    }
  }

  // Brief red flash on the vitals when something lands a hit
  flashHurt() {
    const panel = document.getElementById('vitals-panel');
    if (!panel) return;
    panel.classList.add('hurt');
    clearTimeout(this._hurtTimer);
    this._hurtTimer = setTimeout(() => panel.classList.remove('hurt'), 260);
  }

  // Subject 407's health bar, shown only while it is awake and alive
  setBossHealth(fraction) {
    const bar = document.getElementById('boss-bar');
    const fill = document.getElementById('boss-bar-fill');
    const show = fraction > 0;
    if (bar) bar.classList.toggle('hidden', !show);
    if (fill) fill.style.width = `${Math.round(Math.max(0, fraction) * 100)}%`;
  }

  showBannerNotification(text) {
    if (this.notificationBanner) {
      this.notificationBanner.innerText = text;
      this.notificationBanner.classList.add('visible');
      if (this.bannerTimer) clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => {
        this.notificationBanner.classList.remove('visible');
      }, 4500);
    }
  }

  setInteractionPrompt(text) {
    if (text) {
      this.interactionPrompt.innerText = text;
      this.interactionPrompt.classList.remove('hidden');
      this.crosshair.classList.add('active');
    } else {
      this.interactionPrompt.classList.add('hidden');
      this.crosshair.classList.remove('active');
    }
  }

  // Live HUD Updates including Waypoint Beacon distance calculation
  updateHUD(battery, flashlightBattery, stamina, timeSeconds, playerPos, playerRotationY) {
    // Timecode
    const hours = Math.floor(timeSeconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((timeSeconds % 3600) / 60).toString().padStart(2, '0');
    const secs = Math.floor(timeSeconds % 60).toString().padStart(2, '0');
    const frames = Math.floor((timeSeconds * 30) % 30).toString().padStart(2, '0');
    if (this.timecodeElem) {
      this.timecodeElem.innerText = `${hours}:${mins}:${secs}:${frames}`;
    }

    // Camcorder Battery & Flashlight
    if (this.batteryFillElem) {
      this.batteryFillElem.style.width = `${Math.max(5, flashlightBattery)}%`;
      this.batteryFillElem.style.background = flashlightBattery < 20 ? '#ff2222' : '#22ee55';
    }

    if (this.flashlightBarElem) {
      this.flashlightBarElem.style.width = `${flashlightBattery}%`;
    }

    // Stamina Bar
    if (this.staminaBarElem) {
      this.staminaBarElem.style.width = `${stamina}%`;
      this.staminaBarElem.style.background = stamina < 25 ? '#ff4444' : '#22ccff';
    }

    // Night Vision & Zoom Labels
    if (this.nightVisionLabel && this.game.player) {
      const nv = this.game.player.nightVision;
      this.nightVisionLabel.innerText = nv ? 'IR NIGHT-VISION [ON]' : 'IR NIGHT-VISION [OFF: N]';
      this.nightVisionLabel.style.color = nv ? '#22ff66' : '#888888';
    }

    if (this.zoomLabel && this.game.player) {
      this.zoomLabel.innerText = this.game.player.isZoomed ? 'OPTICAL ZOOM: 4.0X' : 'ZOOM: 1.0X [R-CLICK]';
      this.zoomLabel.style.color = this.game.player.isZoomed ? '#ffff55' : '#888888';
    }

    this.updateGuide(timeSeconds, playerPos, playerRotationY);

    // Waypoint Beacon distance calculation
    if (this.waypointBeacon && playerPos) {
      const objData = this.game.story.getCurrentObjectiveData();
      if (objData && objData.target) {
        const dx = objData.target.x - playerPos.x;
        const dz = objData.target.z - playerPos.z;
        const dist = Math.round(Math.sqrt(dx * dx + dz * dz));

        this.waypointBeacon.innerHTML = `◆ TARGET: <strong>${objData.locationName}</strong> [${dist}m away] <span style="font-size:14px; opacity:0.8;">(Press M for Map)</span>`;
      }
    }
  }

  toggleGuide() {
    this.guideOpen = !this.guideOpen;
    this.guideManual = true;
    if (this.guidePanel) this.guidePanel.classList.toggle('hidden', !this.guideOpen);
  }

  // Guide panel opens at the start and hides itself after a minute unless toggled.
  // The arrow turns to face the current objective, relative to where the player is looking.
  updateGuide(timeSeconds, playerPos, playerRotationY) {
    if (this.guidePanel && this.guideOpen && !this.guideManual && timeSeconds > 60) {
      this.guideOpen = false;
      this.guidePanel.classList.add('hidden');
    }

    const objData = this.game.story.getCurrentObjectiveData();
    const player = this.game.player;
    if (!objData || !player) return;

    const charText = player.characterStatus === 'rigged' ? 'animated'
      : player.characterStatus === 'fallback' ? 'basic (see console)'
      : 'loading';
    const viewHint = player.viewMode === 'FIRST_PERSON' ? ' | [V] for 3rd person' : '';
    if (this.guideChar && charText + viewHint !== this._guideChar) {
      this._guideChar = charText + viewHint;
      this.guideChar.innerText = this._guideChar;
    }
    if (this.guideGoal && objData.text !== this._guideGoal) {
      this._guideGoal = objData.text;
      this.guideGoal.innerText = objData.text;
    }

    if (this.objectiveArrow && playerPos && objData.target) {
      const dx = objData.target.x - playerPos.x;
      const dz = objData.target.z - playerPos.z;
      const arrived = Math.hypot(dx, dz) < 2.5;
      this.objectiveArrow.classList.toggle('hidden', arrived);
      if (!arrived) {
        // Yaw 0 faces -z, so the facing angle is yaw + pi on the same scale as atan2(dx, dz)
        const heading = playerRotationY + Math.PI;
        let rel = Math.atan2(dx, dz) - heading;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        this.objectiveArrow.style.transform = `rotate(${-rel}rad)`;
      }
    }
  }

  // SANATORIUM FACILITY MAP MODAL
  openMapModal() {
    this.game.state = 'MAP';
    document.exitPointerLock();
    this.mapModal.classList.remove('hidden');
    this.updateMapPlayerPin();
  }

  closeMapModal() {
    this.mapModal.classList.add('hidden');
    this.game.state = 'PLAYING';
    this.game.requestPointerLock();
  }

  updateMapPlayerPin() {
    const pin = document.getElementById('map-player-pin');
    if (!pin || !this.game.player) return;

    // Map range: X from -17 to 17 (width 34m), Z from 24 to -35 (height 59m)
    const px = this.game.player.yawObject.position.x;
    const pz = this.game.player.yawObject.position.z;

    // Convert world coordinates to percentage on 2D map
    const percentX = Math.max(5, Math.min(95, ((px + 17) / 34) * 100));
    // Z: South (24) is bottom (100%), North (-35) is top (0%)
    const percentY = Math.max(5, Math.min(95, ((24 - pz) / 59) * 100));

    pin.style.left = `${percentX}%`;
    pin.style.top = `${percentY}%`;

    // Rotate arrow to player's facing angle
    const deg = (this.game.player.yawObject.rotation.y * (180 / Math.PI)) + 180;
    pin.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
  }

  // SAFE DIAL: the combination is rolled on a dial, not typed. Set up once, in the constructor.
  bindDial() {
    this.dialAngle = 0;           // degrees the dial has been turned
    this.dialDigits = [];         // digits locked so far
    this.dialBusy = false;        // true while the result is showing
    this.dialRing = document.getElementById('dial-ring');
    this.dialFace = document.getElementById('dial-face');
    this.dialReadout = document.getElementById('dial-readout');
    this.dialSlotEls = Array.from(document.querySelectorAll('#dial-slots span'));

    // The ten digits sit around the ring, 36 degrees apart
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('span');
      s.className = 'dial-num';
      s.textContent = String(i);
      s.style.transform = `rotate(${i * 36}deg) translateY(-112px) rotate(${-i * 36}deg)`;
      this.dialRing.appendChild(s);
    }

    let last = null;
    this.dialFace.addEventListener('pointerdown', e => {
      last = this.pointerAngle(e);
      this.dialFace.setPointerCapture(e.pointerId);
    });
    this.dialFace.addEventListener('pointermove', e => {
      if (last === null) return;
      const a = this.pointerAngle(e);
      let d = a - last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      last = a;
      this.turnDial(d * 180 / Math.PI);
    });
    const release = () => {
      if (last === null) return;
      last = null;
      this.dialAngle = Math.round(this.dialAngle / 36) * 36;   // click into the nearest digit
      this.renderDial();
    };
    this.dialFace.addEventListener('pointerup', release);
    this.dialFace.addEventListener('pointercancel', release);
    this.dialFace.addEventListener('wheel', e => {
      e.preventDefault();
      this.turnDial(e.deltaY * 0.25);
    }, { passive: false });

    document.getElementById('btn-dial-lock').addEventListener('click', () => this.lockDigit());
    document.getElementById('btn-dial-clear').addEventListener('click', () => this.clearDial());
    window.addEventListener('keydown', e => {
      if (this.safeKeypadModal.classList.contains('hidden')) return;
      if (e.key === 'ArrowLeft') this.turnDial(-36);
      else if (e.key === 'ArrowRight') this.turnDial(36);
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.lockDigit(); }
      else if (e.key === 'Backspace') this.clearDial();
    });
  }

  // Angle of the pointer around the centre of the dial, in radians
  pointerAngle(e) {
    const r = this.dialFace.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  }

  // The digit under the pointer at the top of the dial
  topDigit() {
    const n = Math.round(-this.dialAngle / 36);
    return ((n % 10) + 10) % 10;
  }

  turnDial(deg) {
    if (this.dialBusy) return;
    this.dialAngle += deg;
    this.renderDial();
  }

  renderDial() {
    this.dialRing.style.transform = `rotate(${this.dialAngle}deg)`;
    const d = this.topDigit();
    this.dialReadout.textContent = `DIGIT ${d}`;
    if (this.game.turnSafeDial) this.game.turnSafeDial(d);
  }

  renderSlots(color = '#22ee55') {
    this.dialSlotEls.forEach((el, i) => {
      el.textContent = this.dialDigits[i] !== undefined ? this.dialDigits[i] : '_';
      el.style.color = color;
    });
  }

  // LOCK: sets the digit under the pointer. The fourth digit tries the combination.
  lockDigit() {
    if (this.dialBusy || this.dialDigits.length >= 4) return;
    this.dialDigits.push(this.topDigit());
    soundEngine.playKeypadBeep();
    this.renderSlots();
    if (this.dialDigits.length < 4) return;

    this.dialBusy = true;
    if (this.dialDigits.join('') === this.keypadTarget) {
      soundEngine.playKeypadBeep(true);
      this.renderSlots('#33ff55');
      this.dialReadout.textContent = 'OPEN';
      setTimeout(() => {
        this.closeSafeKeypad();
        this.game.unlockWallSafe();
      }, 1000);
    } else {
      soundEngine.playKeypadBeep(false, true);
      this.renderSlots('#ff3333');
      this.dialReadout.textContent = 'DENIED';
      setTimeout(() => this.clearDial(), 1200);
    }
  }

  clearDial() {
    this.dialDigits = [];
    this.dialBusy = false;
    this.renderSlots();
    this.renderDial();
  }

  // SAFE DIAL MODAL
  openSafeKeypad() {
    this.dialAngle = 0;
    this.clearDial();
    this.safeKeypadModal.classList.remove('hidden');
    this.game.state = 'KEYPAD';
    document.exitPointerLock();
  }

  closeSafeKeypad() {
    this.safeKeypadModal.classList.add('hidden');
    this.game.state = 'PLAYING';
    this.game.requestPointerLock();
  }

  // The old typed keypad is gone; kept as a no-op for the legacy listeners in bindEvents
  updateKeypadDisplay() {}

  // DOCUMENT MODAL
  openDocumentModal(title, text, hint) {
    this.game.state = 'DOCUMENT';
    document.exitPointerLock();
    document.getElementById('doc-title').innerText = title;
    document.getElementById('doc-content').innerText = text;
    document.getElementById('doc-clue').innerText = hint ? `CLUE IDENTIFIED: [ ${hint} ]` : '';
    this.documentModal.classList.remove('hidden');
    soundEngine.playItemPickup();
  }

  closeDocumentModal() {
    this.documentModal.classList.add('hidden');
    this.game.state = 'PLAYING';
    this.game.requestPointerLock();
  }

  // INVENTORY MODAL
  toggleInventory() {
    this.game.state = 'INVENTORY';
    document.exitPointerLock();
    this.inventoryModal.classList.remove('hidden');
    this.renderInventory();
  }

  closeInventory() {
    this.inventoryModal.classList.add('hidden');
    this.game.state = 'PLAYING';
    this.game.requestPointerLock();
  }

  renderInventory() {
    const list = document.getElementById('inv-tapes-list');
    list.innerHTML = '';

    const tapes = this.game.player.inventory.tapes;
    if (tapes.length === 0) {
      list.innerHTML = '<div class="inv-empty-note">[NO VHS TAPES RECOVERED YET]</div>';
    } else {
      tapes.forEach(tape => {
        const item = document.createElement('div');
        item.className = 'inv-tape-card';
        item.innerHTML = `
          <div class="tape-icon">📼</div>
          <div class="tape-info">
            <div class="tape-title">${tape.title}</div>
            <div class="tape-date">${tape.date}</div>
          </div>
          <button class="btn-tape-play" data-id="${tape.id}">PLAY</button>
        `;
        item.querySelector('.btn-tape-play').addEventListener('click', () => {
          this.closeInventory();
          this.playTape(tape.id);
        });
        list.appendChild(item);
      });
    }

    // Keycard inventory
    const keyContainer = document.getElementById('inv-keys-list');
    keyContainer.innerHTML = '';
    const keys = Array.from(this.game.player.inventory.keys);
    if (keys.length === 0) {
      keyContainer.innerHTML = '<span>None</span>';
    } else {
      keys.forEach(k => {
        const badge = document.createElement('span');
        badge.className = 'key-badge';
        badge.innerText = `🔑 ${k.toUpperCase().replace(/_/g, ' ')}`;
        keyContainer.appendChild(badge);
      });
    }

    // Fuse status
    document.getElementById('inv-fuse-status').innerText = this.game.player.inventory.hasFuse ? '✅ In Bag' : '❌ Not Found';
  }

  // VCR PLAYBACK SCREEN
  playTape(tapeId) {
    const tape = TAPES_DATABASE[tapeId];
    if (!tape) return;

    this.game.state = 'PLAYING_TAPE';
    document.exitPointerLock();

    soundEngine.playVcrInsert();
    soundEngine.playTapeDialogue(tape.audioPlan);

    document.getElementById('vcr-tape-title').innerText = tape.title;
    document.getElementById('vcr-tape-date').innerText = tape.date;
    document.getElementById('vcr-subtitles').innerText = "CONNECTING TAPE HEADS...";

    this.vcrPlaybackModal.classList.remove('hidden');

    let currentTranscriptIdx = 0;
    const advanceSubtitle = () => {
      if (this.game.state !== 'PLAYING_TAPE') return;
      if (currentTranscriptIdx < tape.transcript.length) {
        const entry = tape.transcript[currentTranscriptIdx];
        document.getElementById('vcr-subtitles').innerText = entry.text;
        currentTranscriptIdx++;
        this.activeTapeTimer = setTimeout(advanceSubtitle, entry.duration);
      } else {
        document.getElementById('vcr-subtitles').innerText = "[END OF RECORDING - TAPE STOPPED]";
      }
    };
    this.activeTapeTimer = setTimeout(advanceSubtitle, 1200);
  }

  stopTapePlayback() {
    if (this.activeTapeTimer) {
      clearTimeout(this.activeTapeTimer);
      this.activeTapeTimer = null;
    }
    this.vcrPlaybackModal.classList.add('hidden');
    this.game.state = 'PLAYING';
    this.game.requestPointerLock();
  }
}
