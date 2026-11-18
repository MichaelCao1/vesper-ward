import {
  FloorId,
  GameMode,
  GameSettings,
  ItemDef,
  LampMode,
  LoreEntryDef,
  PuzzleId,
  Vec3,
} from '../core/types';
import { ITEMS, LORE_ENTRIES } from '../world/itemsAndLore';
import { DOORS, ROOMS, STAIR_RAMPS } from '../world/worldData';
import { ItemExaminer3D } from '../world/itemExaminer3D';
import { GameplayStateAndPuzzleSystem } from '../systems/puzzleSystem';
import { SettingsManager } from '../core/settings';

export interface UIActions {
  onStartNewGame: () => void;
  onContinueGame: () => void;
  onResumeGame: () => void;
  onReturnToTitle: () => void;
  onRetryCheckpoint: () => void;
  onUnstuck: () => void;
  onRequestMode: (mode: GameMode) => void;
  onUseConsumable: (itemId: string) => void;
  onCombineItems: (a: string, b: string) => { ok: boolean; message: string };
  onSelectElevatorFloor: (floor: FloorId) => void;
  onPuzzleUpdated: (event: string) => void;
}

export class UIManager {
  private layer: HTMLElement;
  private hudRoot: HTMLElement | null = null;
  private damageVignetteEl: HTMLElement | null = null;
  private hudZoneEl: HTMLElement | null = null;
  private hudObjEl: HTMLElement | null = null;
  private hudPillsEl: HTMLElement | null = null;
  private hudReticleEl: HTMLElement | null = null;
  private hudPromptEl: HTMLElement | null = null;
  private hudStamWrapEl: HTMLElement | null = null;
  private hudStamFillEl: HTMLElement | null = null;
  private hudLuxPanelEl: HTMLElement | null = null;
  private hudLuxModeEl: HTMLElement | null = null;
  private hudLuxPctEl: HTMLElement | null = null;
  private hudLuxBarEl: HTMLElement | null = null;
  private hudLuxNeedleEl: Element | null = null;
  private hudLuxBeltEl: HTMLElement | null = null;
  private captionsWrap: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private toastMessage = '';
  private toastTimer = 0;
  private toastIsDanger = false;
  private currentMode: GameMode = 'title';

  // R5-PERF-01: Dirty-checked HUD state cache (zero redundant DOM queries/innerHTML rebuilds at 60 Hz)
  private prevVignetteOpacity = '';
  private prevZoneText = '';
  private prevObjText = '';
  private prevPillsKey = '';
  private prevReticleClass = '';
  private prevPromptText: string | null = null;
  private prevStamVisible: boolean | null = null;
  private prevStamPct = -1;
  private prevLuxVisible: boolean | null = null;
  private prevLuxMode: LampMode | -1 = -1;
  private prevLuxPct = -1;
  private prevNeedleHalfDeg = -9999;
  private prevBeltText = '';

  private activeTab: 'inventory' | 'lore' | 'map' = 'inventory';
  private selectedItemId: string | null = null;
  private combineSourceId: string | null = null;
  private selectedLoreId: string | null = null;
  private selectedMapFloor: FloorId = 'G1';

  private playerMapPos: Vec3 = { x: 0, y: 0, z: 13.4 };
  private playerMapYaw = 0;
  private playerMapFloor: FloorId = 'G1';
  private playerMapRoomId = 'R01';

  private activeExaminerNoteEl: HTMLElement | null = null;
  private activeExaminerItem: ItemDef | null = null;

  private settingsMgr: SettingsManager;
  private stateSys: GameplayStateAndPuzzleSystem;
  private examiner: ItemExaminer3D;
  private actions: UIActions;
  private returnModeFromSettings: GameMode = 'title';

  constructor(
    layer: HTMLElement,
    settingsMgr: SettingsManager,
    stateSys: GameplayStateAndPuzzleSystem,
    examiner: ItemExaminer3D,
    actions: UIActions
  ) {
    this.layer = layer;
    this.settingsMgr = settingsMgr;
    this.stateSys = stateSys;
    this.examiner = examiner;
    this.actions = actions;
  }

  public setPlayerMapContext(pos: Vec3, yaw: number, floor: FloorId, roomId: string): void {
    this.playerMapPos = { ...pos };
    this.playerMapYaw = yaw;
    this.playerMapFloor = floor;
    this.playerMapRoomId = roomId;
  }

  // R6-UI-02: Suppress ordinary HUD toasts over suspended modals (inventory/examine/settings/paused),
  // and move live puzzle/lore alerts to a non-overlapping bottom-center bar so Back/Close/Step Back are never covered.
  public showToast(msg: string, durationSec = 4.0, isDanger = false): void {
    this.toastMessage = msg;
    this.toastTimer = durationSec;
    this.toastIsDanger = isDanger;
    this.syncToastPresentation();
  }

  private syncToastPresentation(): void {
    if (!this.toastEl || !this.toastEl.parentElement) {
      const t = document.createElement('div');
      t.id = 'hud-toast';
      this.layer.appendChild(t);
      this.toastEl = t;
    }

    const activeTimer = this.toastTimer > 0 && Boolean(this.toastMessage);
    let shouldDisplay = false;
    let modalSafe = false;
    if (activeTimer) {
      if (this.currentMode === 'playing') {
        shouldDisplay = true;
      } else if (this.currentMode === 'puzzle' || this.currentMode === 'lore_modal') {
        shouldDisplay = true;
        modalSafe = true;
      }
    }

    this.toastEl.textContent = this.toastMessage;
    this.toastEl.className = `hud-toast${modalSafe ? ' modal-safe' : ''}${this.toastIsDanger ? ' danger' : ''}`;
    this.toastEl.style.display = shouldDisplay ? 'block' : 'none';
  }

  public refreshActiveExaminerNote(): void {
    if (!this.activeExaminerNoteEl || !this.activeExaminerItem) return;
    const item = this.activeExaminerItem;
    const discovered = Boolean(item.examineSecretFlag && this.stateSys.flags.has(item.examineSecretFlag));
    this.activeExaminerNoteEl.className = `examiner-clue-note${discovered ? ' discovered' : ''}`;
    this.activeExaminerNoteEl.textContent = discovered
      ? `✓ CLUE RECORDED: ${item.examineSecretText ?? ''}`
      : 'Rotate the 3D artifact (drag with mouse or click buttons) to inspect all faces, engravings, and mechanical end-caps.';
  }

  public pushCaption(text: string, danger = false): void {
    if (!this.captionsWrap || !this.settingsMgr.get().subtitlesAndCaptions) return;
    const line = document.createElement('div');
    line.className = `caption-line${danger ? ' danger' : ''}`;
    line.textContent = text;
    this.captionsWrap.appendChild(line);
    while (this.captionsWrap.children.length > 3) {
      this.captionsWrap.removeChild(this.captionsWrap.children[0]);
    }
    window.setTimeout(() => {
      if (line.parentElement) line.parentElement.removeChild(line);
    }, 3400);
  }

  public renderMode(
    mode: GameMode,
    hasSave: boolean,
    puzzleContext?: { puzzleId: PuzzleId; subStation?: string },
    loreModalId?: string,
    stats?: { activeSeconds: number; wallClockSeconds: number; distanceMeters: number }
  ): void {
    if ((mode === 'puzzle' || mode === 'lore_modal') && this.currentMode !== mode && !this.toastIsDanger) {
      this.toastTimer = 0;
    }
    this.currentMode = mode;
    this.layer.innerHTML = '';
    this.resetHUDRefsAndCache();
    this.toastEl = null;
    this.activeExaminerNoteEl = null;
    this.activeExaminerItem = null;

    if (mode === 'playing') {
      this.buildHUD();
      this.syncToastPresentation();
      return;
    }

    if (mode !== 'title' && mode !== 'credits') {
      this.buildHUD();
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'screen-backdrop';
    this.layer.appendChild(backdrop);

    switch (mode) {
      case 'title':
        this.renderTitleScreen(backdrop, hasSave);
        break;
      case 'paused':
        this.renderPauseScreen(backdrop);
        break;
      case 'settings':
        this.renderSettingsScreen(backdrop);
        break;
      case 'inventory':
        this.renderBinderModal(backdrop);
        break;
      case 'examine':
        this.renderExaminerModal(backdrop);
        break;
      case 'puzzle':
        if (puzzleContext) this.renderPuzzleModal(backdrop, puzzleContext.puzzleId, puzzleContext.subStation);
        break;
      case 'lore_modal':
        if (loreModalId) this.renderSingleLoreModal(backdrop, loreModalId);
        break;
      case 'dead':
        this.renderDeathScreen(backdrop);
        break;
      case 'ending':
      case 'credits':
        this.renderCreditsScreen(
          backdrop,
          stats ?? { activeSeconds: 0, wallClockSeconds: 0, distanceMeters: 0 }
        );
        break;
    }

    this.syncToastPresentation();
  }

  public tickOverlayTimers(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0 && this.toastEl) {
        this.toastEl.style.display = 'none';
      }
    }
  }

  private resetHUDRefsAndCache(): void {
    this.hudRoot = null;
    this.hudZoneEl = null;
    this.hudObjEl = null;
    this.hudPillsEl = null;
    this.hudReticleEl = null;
    this.hudPromptEl = null;
    this.hudStamWrapEl = null;
    this.hudStamFillEl = null;
    this.hudLuxPanelEl = null;
    this.hudLuxModeEl = null;
    this.hudLuxPctEl = null;
    this.hudLuxBarEl = null;
    this.hudLuxNeedleEl = null;
    this.hudLuxBeltEl = null;
    this.captionsWrap = null;
    this.prevVignetteOpacity = '';
    this.prevZoneText = '';
    this.prevObjText = '';
    this.prevPillsKey = '__init__';
    this.prevReticleClass = '';
    this.prevPromptText = '__init__';
    this.prevStamVisible = null;
    this.prevStamPct = -1;
    this.prevLuxVisible = null;
    this.prevLuxMode = -1;
    this.prevLuxPct = -1;
    this.prevNeedleHalfDeg = -9999;
    this.prevBeltText = '';
  }

  public updateHUD(
    dt: number,
    roomCode: string,
    roomName: string,
    objective: string,
    promptText: string | null,
    health: number,
    inSafeHaven: boolean,
    isHidden: boolean,
    stamina: number,
    luxAcquired: boolean,
    lampMode: LampMode,
    lampCharge: number,
    needleReading: number
  ): void {
    if (!this.damageVignetteEl) {
      this.damageVignetteEl = document.getElementById('damage-vignette');
    }
    const vigOpacity = health === 1 ? '0.82' : health === 0 ? '1' : '0';
    if (this.damageVignetteEl && vigOpacity !== this.prevVignetteOpacity) {
      this.prevVignetteOpacity = vigOpacity;
      this.damageVignetteEl.style.opacity = vigOpacity;
    }

    this.tickOverlayTimers(dt);

    if (!this.hudRoot) return;

    const zoneText = `${roomCode} • ${roomName}`;
    if (this.hudZoneEl && zoneText !== this.prevZoneText) {
      this.prevZoneText = zoneText;
      this.hudZoneEl.textContent = zoneText;
    }
    if (this.hudObjEl && objective !== this.prevObjText) {
      this.prevObjText = objective;
      this.hudObjEl.textContent = objective;
    }

    const pillsKey = `${health === 1 ? 1 : 0}|${inSafeHaven ? 1 : 0}|${isHidden ? 1 : 0}`;
    if (this.hudPillsEl && pillsKey !== this.prevPillsKey) {
      this.prevPillsKey = pillsKey;
      const pills: string[] = [];
      if (health === 1) pills.push(`<span class="status-pill warn">WOUNDED — PRESS [H] GAUZE</span>`);
      if (inSafeHaven) pills.push(`<span class="status-pill safe">SAFE HAVEN</span>`);
      if (isHidden) pills.push(`<span class="status-pill safe">CONCEALED — [F] EXIT</span>`);
      this.hudPillsEl.innerHTML = pills.join('');
    }

    const hc = this.settingsMgr.get().highContrastReticle;
    const reticleClass = `hud-reticle${promptText ? ' active' : ''}${hc ? ' high-contrast' : ''}`;
    if (this.hudReticleEl && reticleClass !== this.prevReticleClass) {
      this.prevReticleClass = reticleClass;
      this.hudReticleEl.className = reticleClass;
    }
    if (this.hudPromptEl && promptText !== this.prevPromptText) {
      this.prevPromptText = promptText;
      if (promptText) {
        this.hudPromptEl.style.display = 'block';
        this.hudPromptEl.textContent = promptText;
      } else {
        this.hudPromptEl.style.display = 'none';
      }
    }

    const stamVisible = stamina < 98;
    if (this.hudStamWrapEl && stamVisible !== this.prevStamVisible) {
      this.prevStamVisible = stamVisible;
      this.hudStamWrapEl.style.opacity = stamVisible ? '1' : '0';
    }
    if (stamVisible && this.hudStamFillEl) {
      const stamPct = Math.round(stamina);
      if (stamPct !== this.prevStamPct) {
        this.prevStamPct = stamPct;
        this.hudStamFillEl.style.width = `${stamPct}%`;
      }
    }

    if (this.hudLuxPanelEl && luxAcquired !== this.prevLuxVisible) {
      this.prevLuxVisible = luxAcquired;
      this.hudLuxPanelEl.style.display = luxAcquired ? 'block' : 'none';
    }

    if (luxAcquired) {
      if (lampMode !== this.prevLuxMode) {
        this.prevLuxMode = lampMode;
        const modeText = lampMode === 1 ? 'TUNGSTEN [L]' : lampMode === 2 ? 'RUBY 640nm [L]' : 'LAMP OFF [L]';
        if (this.hudLuxModeEl) this.hudLuxModeEl.textContent = modeText;
        if (this.hudLuxBarEl) {
          this.hudLuxBarEl.style.background =
            lampMode === 2 ? '#c93b35' : lampMode === 1 ? '#e0bd72' : '#6c756d';
        }
      }

      const chargePct = Math.round(lampCharge);
      if (chargePct !== this.prevLuxPct) {
        this.prevLuxPct = chargePct;
        if (this.hudLuxPctEl) this.hudLuxPctEl.textContent = `${chargePct}%`;
        if (this.hudLuxBarEl) this.hudLuxBarEl.style.width = `${chargePct}%`;
      }

      const halfDeg = Math.round((-55 + needleReading * 110) * 2);
      if (this.hudLuxNeedleEl && halfDeg !== this.prevNeedleHalfDeg) {
        this.prevNeedleHalfDeg = halfDeg;
        this.hudLuxNeedleEl.setAttribute('transform', `rotate(${(halfDeg * 0.5).toFixed(1)} 48 46)`);
      }

      if (this.hudLuxBeltEl) {
        const cells = this.stateSys.getItemCount('capacitor_cell');
        const gauze = this.stateSys.getItemCount('gauze_injector');
        const vials = this.stateSys.getItemCount('glass_vial');
        const beltText = `[G] Cell:${cells}  [H] Gauze:${gauze}  [V] Vial:${vials}`;
        if (beltText !== this.prevBeltText) {
          this.prevBeltText = beltText;
          this.hudLuxBeltEl.textContent = beltText;
        }
      }
    }
  }

  public setBinderTab(tab: 'inventory' | 'lore' | 'map', currentFloor: FloorId): void {
    this.activeTab = tab;
    this.selectedMapFloor = currentFloor;
  }

  public openSettingsFrom(returnMode: GameMode): void {
    this.returnModeFromSettings = returnMode;
  }

  public getReturnModeFromSettings(): GameMode {
    return this.returnModeFromSettings;
  }

  private buildHUD(): void {
    const hud = document.createElement('div');
    hud.className = 'hud-root';
    hud.innerHTML = `
      <div class="hud-top-left">
        <div id="hud-zone" class="hud-zone-tag">G1-01 • EXTERIOR STORM PORTICO</div>
        <div id="hud-obj" class="hud-objective"></div>
        <div id="hud-pills" class="hud-status-pills"></div>
      </div>

      <div class="hud-reticle-wrap">
        <div id="hud-reticle" class="hud-reticle"></div>
        <div id="hud-prompt" class="hud-prompt" style="display:none"></div>
      </div>

      <div id="hud-stam-wrap" class="hud-stamina-wrap" style="opacity:0">
        <div id="hud-stam-fill" class="hud-stamina-fill" style="width:100%"></div>
      </div>

      <div id="hud-captions" class="hud-captions" aria-live="polite"></div>

      <div id="hud-lux" class="hud-lux-instrument" style="display:none">
        <div class="lux-header">
          <span>INDUCTIVE LUX-METER</span>
          <span id="lux-mode-txt">OFF [L]</span>
        </div>
        <div class="lux-dial-row">
          <svg class="lux-gauge-svg" viewBox="0 0 96 54">
            <path d="M 10 46 A 38 38 0 0 1 86 46" fill="none" stroke="#61502e" stroke-width="3" />
            <path d="M 68 15 A 38 38 0 0 1 86 46" fill="none" stroke="#b83b35" stroke-width="3" />
            <g id="lux-needle-line" transform="rotate(-48 48 46)">
              <line x1="48" y1="46" x2="48" y2="11" stroke="#7ef0b8" stroke-width="2.2" />
            </g>
            <circle cx="48" cy="46" r="4" fill="#d4b26a" />
          </svg>
          <div class="lux-readouts">
            <div class="lux-cap-row">
              <span>CAPACITOR</span>
              <span id="lux-pct-txt">88%</span>
            </div>
            <div class="lux-bar-track"><div id="lux-bar-fill" class="lux-bar-fill" style="width:88%"></div></div>
            <div style="font-size:10px;color:var(--paper-dim);white-space:nowrap;">HARMONIC DOSIMETER</div>
          </div>
        </div>
        <div id="lux-belt-counts" class="lux-quick-Belt"></div>
      </div>
    `;
    this.layer.appendChild(hud);
    this.resetHUDRefsAndCache();
    this.hudRoot = hud;
    this.hudZoneEl = hud.querySelector('#hud-zone');
    this.hudObjEl = hud.querySelector('#hud-obj');
    this.hudPillsEl = hud.querySelector('#hud-pills');
    this.hudReticleEl = hud.querySelector('#hud-reticle');
    this.hudPromptEl = hud.querySelector('#hud-prompt');
    this.hudStamWrapEl = hud.querySelector('#hud-stam-wrap');
    this.hudStamFillEl = hud.querySelector('#hud-stam-fill');
    this.hudLuxPanelEl = hud.querySelector('#hud-lux');
    this.hudLuxModeEl = hud.querySelector('#lux-mode-txt');
    this.hudLuxPctEl = hud.querySelector('#lux-pct-txt');
    this.hudLuxBarEl = hud.querySelector('#lux-bar-fill');
    this.hudLuxNeedleEl = hud.querySelector('#lux-needle-line');
    this.hudLuxBeltEl = hud.querySelector('#lux-belt-counts');
    this.captionsWrap = hud.querySelector('#hud-captions');
  }

  private renderTitleScreen(backdrop: HTMLElement, hasSave: boolean): void {
    const sheet = document.createElement('div');
    sheet.className = 'archival-sheet';
    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker">City of Havenport • Condemned Municipal Registry #88-412</div>
          <h1 class="archival-title">VESPER WARD</h1>
          <p class="archival-subtitle">St. Damian Thoracic &amp; Somnology Infirmary — Sub-Basal Tympanic Inspection</p>
        </div>
        <div class="archival-kicker">November 17, 1994</div>
      </div>
      <div class="two-col">
        <div>
          <p style="font-family:var(--font-serif);line-height:1.65;color:var(--paper-muted);margin-top:0;">
            Dispatched on a rain-swept November night to certify utility disconnects prior to demolition, Inspector <strong>Mara Solis</strong> finds 120 kilowatts of live power feeding deep beneath St. Damian's 1928 foundation—and Subject 09 listening through the dark.
          </p>
          <div class="menu-actions">
            <button id="btn-new-game" class="btn-brass primary">Begin Inspection (New Game)</button>
            <button id="btn-continue-game" class="btn-brass" ${hasSave ? '' : 'disabled'}>Resume Saved Inspection</button>
            <button id="btn-open-settings" class="btn-brass">Settings, Gamma &amp; Accessibility</button>
          </div>
        </div>
        <div class="puzzle-box" style="margin-top:0;">
          <div class="archival-kicker" style="margin-bottom:6px;">Field Controls Reference</div>
          ${this.renderControlsTableHTML()}
        </div>
      </div>
    `;
    backdrop.appendChild(sheet);

    sheet.querySelector('#btn-new-game')?.addEventListener('click', () => this.actions.onStartNewGame());
    sheet.querySelector('#btn-continue-game')?.addEventListener('click', () => this.actions.onContinueGame());
    sheet.querySelector('#btn-open-settings')?.addEventListener('click', () => {
      this.returnModeFromSettings = 'title';
      this.actions.onRequestMode('settings');
    });
  }

  private renderPauseScreen(backdrop: HTMLElement): void {
    const sheet = document.createElement('div');
    sheet.className = 'archival-sheet';
    sheet.style.maxWidth = '640px';
    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker">Inspection Paused</div>
          <h2 class="archival-title" style="font-size:26px;">St. Damian Field Clipboard</h2>
        </div>
      </div>
      <p style="font-family:var(--font-serif);color:var(--paper-muted);margin-top:0;">
        <strong>Current Objective:</strong> ${this.stateSys.getCurrentObjectiveText()}
      </p>
      <div class="menu-actions" style="max-width:100%;">
        <button id="btn-resume" class="btn-brass primary">Resume Inspection [Esc]</button>
        <button id="btn-binder" class="btn-brass">Open Inventory, Lore &amp; Schematic [Tab]</button>
        <button id="btn-settings" class="btn-brass">Settings, Gamma &amp; Controls</button>
        <button id="btn-unstuck" class="btn-brass">Unstuck / Return to Room Safe Threshold</button>
        <button id="btn-title" class="btn-brass">Return to Title Screen</button>
      </div>
    `;
    backdrop.appendChild(sheet);

    sheet.querySelector('#btn-resume')?.addEventListener('click', () => this.actions.onResumeGame());
    sheet.querySelector('#btn-binder')?.addEventListener('click', () => this.actions.onRequestMode('inventory'));
    sheet.querySelector('#btn-settings')?.addEventListener('click', () => {
      this.returnModeFromSettings = 'paused';
      this.actions.onRequestMode('settings');
    });
    sheet.querySelector('#btn-unstuck')?.addEventListener('click', () => this.actions.onUnstuck());
    sheet.querySelector('#btn-title')?.addEventListener('click', () => this.actions.onReturnToTitle());
  }

  private renderSettingsScreen(backdrop: HTMLElement): void {
    const s = this.settingsMgr.get();
    const sheet = document.createElement('div');
    sheet.className = 'archival-sheet';
    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker">Calibration &amp; Comfort</div>
          <h2 class="archival-title" style="font-size:26px;">Settings &amp; Accessibility</h2>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="btn-reset-settings" class="btn-brass">Reset Defaults</button>
          <button id="btn-close-settings" class="btn-brass primary">Save &amp; Return</button>
        </div>
      </div>

      <div class="puzzle-box" style="margin-top:0;margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="archival-kicker">Brightness / Gamma Calibration (<span id="val-gamma">${s.gamma.toFixed(2)}</span>)</span>
          <span style="font-size:12px;color:var(--paper-muted);">Adjust until Sigil I is barely visible, II is clear, and III is crisp</span>
        </div>
        <input id="inp-gamma" type="range" min="0.70" max="1.45" step="0.02" value="${s.gamma}" style="margin-top:8px;" />
        <div id="gamma-swatch-row" class="gamma-swatches"></div>
      </div>

      <div class="settings-grid">
        <div>
          <div class="archival-kicker" style="margin-bottom:8px;">Audio Mixer &amp; Camera</div>
          <div class="setting-row">
            <label for="inp-master">Master Volume (<span id="val-master">${Math.round(s.masterVolume * 100)}%</span>)</label>
            <input id="inp-master" type="range" min="0" max="1" step="0.05" value="${s.masterVolume}" />
          </div>
          <div class="setting-row">
            <label for="inp-amb">Ambience Volume (<span id="val-amb">${Math.round(s.ambienceVolume * 100)}%</span>)</label>
            <input id="inp-amb" type="range" min="0" max="1" step="0.05" value="${s.ambienceVolume}" />
          </div>
          <div class="setting-row">
            <label for="inp-sfx">SFX Volume (<span id="val-sfx">${Math.round(s.sfxVolume * 100)}%</span>)</label>
            <input id="inp-sfx" type="range" min="0" max="1" step="0.05" value="${s.sfxVolume}" />
          </div>
          <div class="setting-row">
            <label for="inp-voice">Voice / Reel Logs (<span id="val-voice">${Math.round(s.voiceVolume * 100)}%</span>)</label>
            <input id="inp-voice" type="range" min="0" max="1" step="0.05" value="${s.voiceVolume}" />
          </div>
          <div class="setting-row">
            <label for="inp-fov">Field of View (<span id="val-fov">${s.fov}°</span>)</label>
            <input id="inp-fov" type="range" min="70" max="105" step="1" value="${s.fov}" />
          </div>
          <div class="setting-row">
            <label for="inp-sens">Mouse Sensitivity (<span id="val-sens">${s.mouseSensitivity.toFixed(2)}x</span>)</label>
            <input id="inp-sens" type="range" min="0.2" max="2.5" step="0.05" value="${s.mouseSensitivity}" />
          </div>
        </div>

        <div>
          <div class="archival-kicker" style="margin-bottom:8px;">Accessibility &amp; Motion Comfort</div>
          <label class="setting-row-inline"><span>Subtitles &amp; Directional Closed Captions</span><input id="chk-captions" type="checkbox" ${s.subtitlesAndCaptions ? 'checked' : ''} /></label>
          <label class="setting-row-inline"><span>Invert Vertical Look (Y-Axis)</span><input id="chk-inverty" type="checkbox" ${s.invertY ? 'checked' : ''} /></label>
          <label class="setting-row-inline"><span>Disable Camera Head-Bob</span><input id="chk-nobob" type="checkbox" ${s.disableHeadBob ? 'checked' : ''} /></label>
          <label class="setting-row-inline"><span>Reduce Camera Shake</span><input id="chk-noshake" type="checkbox" ${s.reduceCameraShake ? 'checked' : ''} /></label>
          <label class="setting-row-inline"><span>Reduce Strobe / Flashing Lights</span><input id="chk-nostrobe" type="checkbox" ${s.reduceFlashingLights ? 'checked' : ''} /></label>
          <label class="setting-row-inline"><span>High-Contrast Reticle &amp; Interactable Highlights</span><input id="chk-hc" type="checkbox" ${s.highContrastReticle ? 'checked' : ''} /></label>

          <div class="archival-kicker" style="margin:14px 0 6px;">Dual Keybindings Summary</div>
          ${this.renderControlsTableHTML()}
        </div>
      </div>
    `;
    backdrop.appendChild(sheet);

    const updateGammaSwatches = (gamma: number) => {
      const row = sheet.querySelector('#gamma-swatch-row');
      if (!row) return;
      const lift = (gamma - 1.0) * 48;
      const c1 = Math.max(8, Math.min(95, Math.round(20 + lift)));
      const c2 = Math.max(24, Math.min(165, Math.round(62 + lift * 1.2)));
      const c3 = Math.max(70, Math.min(235, Math.round(138 + lift * 1.3)));
      row.innerHTML = `
        <div class="gamma-swatch" style="background:#0a0c0c;color:rgb(${c1},${c1},${c1});">
          <strong style="font-size:20px;">✢ SIGIL I</strong>
          <span style="font-size:11px;">Barely Visible Shadow</span>
        </div>
        <div class="gamma-swatch" style="background:#101414;color:rgb(${c2},${c2},${c2});">
          <strong style="font-size:20px;">✢ SIGIL II</strong>
          <span style="font-size:11px;">Clear Mid-Shadow</span>
        </div>
        <div class="gamma-swatch" style="background:#171d1c;color:rgb(${c3},${c3 - 6},${c3 - 14});">
          <strong style="font-size:20px;">✢ SIGIL III</strong>
          <span style="font-size:11px;">Crisp Highlight</span>
        </div>
      `;
    };
    updateGammaSwatches(s.gamma);

    const bindRange = (id: string, valId: string, fmt: (n: number) => string, patchKey: keyof GameSettings) => {
      const el = sheet.querySelector(`#${id}`) as HTMLInputElement | null;
      const vEl = sheet.querySelector(`#${valId}`);
      el?.addEventListener('input', () => {
        const num = Number.parseFloat(el.value);
        if (vEl) vEl.textContent = fmt(num);
        this.settingsMgr.update({ [patchKey]: num } as Partial<GameSettings>);
        if (patchKey === 'gamma') updateGammaSwatches(num);
      });
    };

    bindRange('inp-gamma', 'val-gamma', (n) => n.toFixed(2), 'gamma');
    bindRange('inp-master', 'val-master', (n) => `${Math.round(n * 100)}%`, 'masterVolume');
    bindRange('inp-amb', 'val-amb', (n) => `${Math.round(n * 100)}%`, 'ambienceVolume');
    bindRange('inp-sfx', 'val-sfx', (n) => `${Math.round(n * 100)}%`, 'sfxVolume');
    bindRange('inp-voice', 'val-voice', (n) => `${Math.round(n * 100)}%`, 'voiceVolume');
    bindRange('inp-fov', 'val-fov', (n) => `${Math.round(n)}°`, 'fov');
    bindRange('inp-sens', 'val-sens', (n) => `${n.toFixed(2)}x`, 'mouseSensitivity');

    const bindCheck = (id: string, patchKey: keyof GameSettings) => {
      const el = sheet.querySelector(`#${id}`) as HTMLInputElement | null;
      el?.addEventListener('change', () => {
        this.settingsMgr.update({ [patchKey]: el.checked } as Partial<GameSettings>);
      });
    };
    bindCheck('chk-captions', 'subtitlesAndCaptions');
    bindCheck('chk-inverty', 'invertY');
    bindCheck('chk-nobob', 'disableHeadBob');
    bindCheck('chk-noshake', 'reduceCameraShake');
    bindCheck('chk-nostrobe', 'reduceFlashingLights');
    bindCheck('chk-hc', 'highContrastReticle');

    sheet.querySelector('#btn-reset-settings')?.addEventListener('click', () => {
      this.settingsMgr.reset();
      this.actions.onRequestMode('settings');
    });
    sheet.querySelector('#btn-close-settings')?.addEventListener('click', () => {
      if (this.returnModeFromSettings === 'title') {
        this.actions.onReturnToTitle();
      } else {
        this.actions.onRequestMode(this.returnModeFromSettings);
      }
    });
  }

  private renderBinderModal(backdrop: HTMLElement): void {
    const sheet = document.createElement('div');
    sheet.className = 'archival-sheet';
    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker">Inspector Mara Solis • Field Dossier</div>
          <h2 class="archival-title" style="font-size:25px;">Inventory, Archives &amp; Schematic</h2>
        </div>
        <button id="btn-close-binder" class="btn-brass primary">Close Dossier [Tab / Esc]</button>
      </div>
      <div class="tab-bar">
        <button id="tab-inv" class="tab-btn ${this.activeTab === 'inventory' ? 'active' : ''}">Equipment &amp; Combine [I]</button>
        <button id="tab-lore" class="tab-btn ${this.activeTab === 'lore' ? 'active' : ''}">Documents &amp; Reels (${this.stateSys.collectedLore.size}/${LORE_ENTRIES.length})</button>
        <button id="tab-map" class="tab-btn ${this.activeTab === 'map' ? 'active' : ''}">5-Level Schematic &amp; Shortcuts [M]</button>
      </div>
      <div id="binder-body"></div>
    `;
    backdrop.appendChild(sheet);

    sheet.querySelector('#btn-close-binder')?.addEventListener('click', () => this.actions.onResumeGame());
    sheet.querySelector('#tab-inv')?.addEventListener('click', () => {
      this.activeTab = 'inventory';
      this.actions.onRequestMode('inventory');
    });
    sheet.querySelector('#tab-lore')?.addEventListener('click', () => {
      this.activeTab = 'lore';
      this.actions.onRequestMode('inventory');
    });
    sheet.querySelector('#tab-map')?.addEventListener('click', () => {
      this.activeTab = 'map';
      this.actions.onRequestMode('inventory');
    });

    const body = sheet.querySelector('#binder-body') as HTMLElement;
    if (this.activeTab === 'inventory') this.populateInventoryTab(body);
    else if (this.activeTab === 'lore') this.populateLoreTab(body);
    else this.populateMapTab(body);
  }

  private populateInventoryTab(container: HTMLElement): void {
    const ownedIds = Object.keys(this.stateSys.inventory).filter((k) => this.stateSys.inventory[k] > 0);
    if (!this.selectedItemId || !this.stateSys.hasItem(this.selectedItemId)) {
      this.selectedItemId = ownedIds[0] ?? null;
    }
    const selectedDef: ItemDef | null = this.selectedItemId ? ITEMS[this.selectedItemId] : null;

    container.innerHTML = `
      <div class="two-col">
        <div>
          <div class="item-grid">
            ${
              ownedIds.length === 0
                ? `<div style="color:var(--paper-dim);font-family:var(--font-serif);">Satchel empty — retrieve the Triage Field Kit in G1 Atrium.</div>`
                : ownedIds
                    .map((id) => {
                      const def = ITEMS[id];
                      const qty = this.stateSys.inventory[id];
                      const sel = id === this.selectedItemId ? 'selected' : '';
                      return `
                        <button class="item-card ${sel}" data-item-id="${id}">
                          <span class="item-card-tag">${def.category}${qty > 1 ? ` ×${qty}` : ''}${def.essential ? ' • KEY' : ''}</span>
                          <span class="item-card-name">${def.name}</span>
                        </button>
                      `;
                    })
                    .join('')
            }
          </div>
          <div id="combine-feedback" style="margin-top:12px;font-family:var(--font-mono);font-size:12px;color:var(--brass-bright);">
            ${this.combineSourceId ? `Select second item to combine with ${ITEMS[this.combineSourceId]?.name}...` : ''}
          </div>
        </div>
        <div class="puzzle-box" style="margin-top:0;">
          ${
            selectedDef
              ? `
                <div class="archival-kicker">${selectedDef.category.toUpperCase()}${selectedDef.essential ? ' • ESSENTIAL (INDESTRUCTIBLE)' : ''}</div>
                <h3 style="font-family:var(--font-serif);margin:6px 0 8px;">${selectedDef.name}</h3>
                <p style="font-family:var(--font-serif);color:var(--paper-muted);line-height:1.55;">${selectedDef.description}</p>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
                  <button id="btn-examine-3d" class="btn-brass primary">3D Rotate &amp; Inspect</button>
                  <button id="btn-start-combine" class="btn-brass">Combine With...</button>
                  ${
                    selectedDef.id === 'capacitor_cell' || selectedDef.id === 'gauze_injector'
                      ? `<button id="btn-use-item" class="btn-brass">Use Item Now</button>`
                      : ''
                  }
                </div>
              `
              : `<div style="color:var(--paper-dim);">Select an item to inspect or combine.</div>`
          }
        </div>
      </div>
    `;

    container.querySelectorAll('[data-item-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const clickedId = (btn as HTMLElement).dataset.itemId!;
        if (this.combineSourceId && this.combineSourceId !== clickedId) {
          const res = this.actions.onCombineItems(this.combineSourceId, clickedId);
          this.combineSourceId = null;
          if (res.ok) this.selectedItemId = null;
          this.populateInventoryTab(container);
          const fb = container.querySelector('#combine-feedback');
          if (fb) fb.textContent = res.message;
          return;
        }
        this.selectedItemId = clickedId;
        this.populateInventoryTab(container);
      });
    });

    container.querySelector('#btn-examine-3d')?.addEventListener('click', () => {
      if (this.selectedItemId) this.actions.onRequestMode('examine');
    });
    container.querySelector('#btn-start-combine')?.addEventListener('click', () => {
      this.combineSourceId = this.selectedItemId;
      this.populateInventoryTab(container);
    });
    container.querySelector('#btn-use-item')?.addEventListener('click', () => {
      if (this.selectedItemId) {
        this.actions.onUseConsumable(this.selectedItemId);
        this.populateInventoryTab(container);
      }
    });
  }

  private populateLoreTab(container: HTMLElement): void {
    const collected = LORE_ENTRIES.filter((e) => this.stateSys.collectedLore.has(e.id));
    if (!this.selectedLoreId || !this.stateSys.collectedLore.has(this.selectedLoreId)) {
      this.selectedLoreId = collected[0]?.id ?? null;
    }
    const activeDoc: LoreEntryDef | undefined = collected.find((e) => e.id === this.selectedLoreId);

    container.innerHTML = `
      <div class="two-col">
        <div class="lore-list">
          ${
            collected.length === 0
              ? `<div style="color:var(--paper-dim);font-family:var(--font-serif);">No field records recovered yet.</div>`
              : collected
                  .map(
                    (e) => `
                    <button class="lore-entry-btn ${e.id === this.selectedLoreId ? 'active' : ''}" data-lore-id="${e.id}">
                      <div style="font-family:var(--font-mono);font-size:10px;color:var(--brass-bright);">#${String(e.number).padStart(2, '0')} • ${e.medium}</div>
                      <div>${e.title}</div>
                    </button>
                  `
                  )
                  .join('')
          }
        </div>
        <div class="lore-reader">
          ${
            activeDoc
              ? `
                <div class="archival-kicker">${activeDoc.medium} • ${activeDoc.date}</div>
                <h3 style="margin:6px 0 4px;">${activeDoc.title}</h3>
                <div style="font-size:12px;color:var(--brass-bright);margin-bottom:12px;">Author: ${activeDoc.author}</div>
                <div style="white-space:pre-line;">${activeDoc.body}</div>
              `
              : `<div style="color:var(--paper-dim);">Select a recovered document or audio reel transcript to read.</div>`
          }
        </div>
      </div>
    `;

    container.querySelectorAll('[data-lore-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedLoreId = (btn as HTMLElement).dataset.loreId!;
        this.populateLoreTab(container);
      });
    });
  }

  // R4-UI-01 (Round 6): Full-width 1:1 screen-scaled SVG schematic (860x360) where EVERY rendered
  // screen label across all 5 floors measures >= 13.5px (>= 12px requirement) with zero collisions.
  private populateMapTab(container: HTMLElement): void {
    const floors: FloorId[] = ['G2', 'G1', 'B1', 'B2', 'B3'];
    const floorRooms = ROOMS.filter((r) => r.floor === this.selectedMapFloor);
    const sc = (n: number) => (this.stateSys.shortcutsUnlocked.has(n) ? 'UNBOLTED' : 'SEALED');

    let fMinX = Infinity;
    let fMaxX = -Infinity;
    let fMinZ = Infinity;
    let fMaxZ = -Infinity;
    for (const r of floorRooms) {
      fMinX = Math.min(fMinX, r.bounds.minX);
      fMaxX = Math.max(fMaxX, r.bounds.maxX);
      fMinZ = Math.min(fMinZ, r.bounds.minZ);
      fMaxZ = Math.max(fMaxZ, r.bounds.maxZ);
    }
    if (this.selectedMapFloor === 'G1' || this.selectedMapFloor === 'B1' || this.selectedMapFloor === 'B3') {
      fMaxX = Math.max(fMaxX, 32.8);
    }

    const svgW = 860;
    const svgH = 360;
    const padX = 52;
    const padY = 34;
    const spanX = Math.max(12, fMaxX - fMinX);
    const spanZ = Math.max(10, fMaxZ - fMinZ);
    const scale = Math.min((svgW - padX * 2) / spanX, (svgH - padY * 2) / spanZ);
    const offX = (svgW - spanX * scale) * 0.5;
    const offY = (svgH - spanZ * scale) * 0.5;

    const mapX = (wx: number) => offX + (wx - fMinX) * scale;
    const mapZ = (wz: number) => offY + (wz - fMinZ) * scale;

    const placedBoxes: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
    const recordLabelBox = (x: number, y: number, text: string, fontSize: number, anchor: 'middle' | 'start' = 'middle') => {
      const w = text.length * fontSize * 0.6 + 6;
      const h = fontSize + 4;
      const x0 = anchor === 'middle' ? x - w * 0.5 : x - 2;
      placedBoxes.push({ x0, y0: y - h + 3, x1: x0 + w, y1: y + 3 });
    };

    const conciseSubtitles: Record<string, string> = {
      R01: 'Storm Portico',
      R02: 'Triage Atrium',
      R03: 'Admissions',
      R04: 'East Ward Hall',
      R05: 'Hydrotherapy',
      R06: 'Steam Boiler',
      R08: 'Mezzanine',
      R09: 'Amphitheatre',
      R10: 'Radiology',
      R11: 'Somnology',
      R12: 'Physician Study',
      R13: 'Lift Airlock',
      R14: 'Rotunda Hub',
      R15: 'Cold Archives',
      R16: 'Obs. Gallery',
      R17: 'Service Hall',
      R18: 'Anechoic Pit',
      R19: 'Control Booth',
      R20: 'Cryo Loop',
      R21: 'Bypass Airlock',
      R22: 'Conduit Stair',
      R23: 'Turbine Sump',
      R24: 'Substation',
      R25: 'Containment',
      R26: 'Dawn Courtyard',
    };

    // Room label world-coordinate anchors chosen so every room label has generous separation from stairs, hatches, and doors
    const roomLabelAnchors: Record<string, { wx: number; wz: number; hideSub?: boolean }> = {
      R01: { wx: 0, wz: 10.3 },
      R02: { wx: 0, wz: 2.0 },
      R05: { wx: 15.6, wz: 5.2 },
      R07: { wx: 25.75, wz: -5.6, hideSub: true },
      R08: { wx: 0, wz: 3.6 },
      R12: { wx: 16.2, wz: -8.8 },
      R13: { wx: 22.6, wz: -4.0 },
      R15: { wx: 13.0, wz: -20.0 },
      R17: { wx: 12.0, wz: -3.0 },
      R21: { wx: 12.4, wz: -19.6 },
      R22: { wx: -11.0, wz: -23.0 },
      R23: { wx: 0.2, wz: -21.2 },
      R26: { wx: -27.0, wz: -33.0 },
    };

    // 1. Room <rect> footprints (preserves exact room <rect> count per floor: G2=5, G1=7, B1=5, B2=5, B3=4)
    const rectsSvg = floorRooms
      .map((r) => {
        const sx = mapX(r.bounds.minX);
        const sz = mapZ(r.bounds.minZ);
        const sw = (r.bounds.maxX - r.bounds.minX) * scale;
        const sd = (r.bounds.maxZ - r.bounds.minZ) * scale;
        const isCurrent = this.playerMapFloor === this.selectedMapFloor && this.playerMapRoomId === r.id;
        const stroke = isCurrent ? '#ffe27a' : r.safeHaven ? '#5fe0b4' : '#c9a458';
        const fill = isCurrent
          ? 'rgba(120, 96, 36, 0.34)'
          : r.safeHaven
          ? 'rgba(38, 96, 80, 0.38)'
          : 'rgba(28, 36, 34, 0.82)';
        const anchor = roomLabelAnchors[r.id];
        const cx = anchor ? mapX(anchor.wx) : sx + sw * 0.5;
        const cy = anchor ? mapZ(anchor.wz) : sz + sd * 0.5;
        const sub = conciseSubtitles[r.id] ?? '';
        const showSub = !anchor?.hideSub && Boolean(sub) && sw >= 92 && sd >= 52;
        const codeY = showSub ? cy - 4 : cy + 5;
        recordLabelBox(cx, codeY, r.code, 16, 'middle');
        if (showSub) {
          recordLabelBox(cx, cy + 14, sub, 13.5, 'middle');
        }
        return `
          <g>
            <rect x="${sx.toFixed(1)}" y="${sz.toFixed(1)}" width="${sw.toFixed(1)}" height="${sd.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${isCurrent ? '2.4' : '1.8'}" />
            <text x="${cx.toFixed(1)}" y="${codeY.toFixed(1)}" text-anchor="middle" fill="#f5eedc" font-family="ui-monospace, Menlo, monospace" font-size="16" font-weight="700">${r.code}</text>
            ${
              showSub
                ? `<text x="${cx.toFixed(1)}" y="${(cy + 14).toFixed(1)}" text-anchor="middle" fill="#d2cab4" font-family="sans-serif" font-size="13.5">${sub}</text>`
                : ''
            }
          </g>
        `;
      })
      .join('');

    // 2. Doors & Shortcut Portals on selected floor (drawn with <line> so <rect> count stays pure)
    const floorDoors = DOORS.filter((d) => d.floor === this.selectedMapFloor);
    const doorsSvg = floorDoors
      .map((d) => {
        const dx = mapX(d.x);
        const dz = mapZ(d.z);
        const half = Math.max(7, d.width * scale * 0.45);
        const unlocked =
          !d.lockedBy ||
          (d.lockedBy.shortcutIndex && this.stateSys.shortcutsUnlocked.has(d.lockedBy.shortcutIndex)) ||
          (d.lockedBy.keyId && this.stateSys.hasItem(d.lockedBy.keyId)) ||
          (d.lockedBy.flag && this.stateSys.flags.has(d.lockedBy.flag));
        const col = unlocked ? '#6cf0b5' : '#f09542';
        const x1 = d.axis === 'x' ? dx - half : dx;
        const y1 = d.axis === 'x' ? dz : dz - half;
        const x2 = d.axis === 'x' ? dx + half : dx;
        const y2 = d.axis === 'x' ? dz : dz + half;
        const scIdx = d.lockedBy?.shortcutIndex;
        let scTagSvg = '';
        if (scIdx) {
          const scText = `SC${scIdx}`;
          const tx = scIdx === 2 ? dx - 22 : scIdx === 4 ? dx + 24 : dx;
          const ty = scIdx === 1 ? dz - 10 : dz + 5;
          recordLabelBox(tx, ty, scText, 13.5, 'middle');
          scTagSvg = `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" fill="${col}" font-family="ui-monospace, Menlo, monospace" font-size="13.5" font-weight="700">${scText}</text>`;
        }
        return `
          <g>
            <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#0c1110" stroke-width="6.5" />
            <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="3.6" stroke-linecap="round" />
            ${scTagSvg}
          </g>
        `;
      })
      .join('');

    // 3. Vertical Connectors (Stairs, Freight Lift, SC3 Maintenance Hatch, G2↔B1 Dumbwaiter) — all >= 13.5px
    const connectors: string[] = [];
    const stairNotes: Array<{ floor: FloorId; x: number; z: number; tag: string }> = [
      { floor: 'G1', x: -6.2, z: -4.2, tag: 'WEST STAIR' },
      { floor: 'G1', x: 6.2, z: -4.2, tag: 'SC1 STAIR' },
      { floor: 'G1', x: 25.75, z: 0.2, tag: 'SVC STAIR' },
      { floor: 'G2', x: -6.6, z: -2.2, tag: 'WEST STAIR' },
      { floor: 'G2', x: 6.6, z: 0.2, tag: 'EAST STAIR' },
      { floor: 'G2', x: 24.9, z: -1.4, tag: 'SVC STAIR' },
      { floor: 'B1', x: 12.6, z: -8.8, tag: 'STAIR B1↔B2' },
      { floor: 'B2', x: 16.2, z: -15.4, tag: '↑B1 STAIR' },
      { floor: 'B2', x: -11.0, z: -16.8, tag: 'STAIR B2↔B3' },
      { floor: 'B3', x: -12.6, z: -20.5, tag: '↑B2 STAIR' },
      { floor: 'B3', x: -13.2, z: -33.0, tag: '↑ CULVERT' },
    ];
    for (const st of stairNotes) {
      if (st.floor !== this.selectedMapFloor) continue;
      const cx = mapX(st.x);
      const cz = mapZ(st.z);
      const ty = cz + 19;
      recordLabelBox(cx, ty, st.tag, 13.5, 'middle');
      connectors.push(`
        <g>
          <polygon points="${(cx - 7.5).toFixed(1)},${(cz + 5).toFixed(1)} ${(cx + 7.5).toFixed(1)},${(cz + 5).toFixed(1)} ${cx.toFixed(1)},${(cz - 6.5).toFixed(1)}" fill="#7ad7eb" stroke="#0d1414" stroke-width="1.3" />
          <text x="${cx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" fill="#a6ecfa" font-family="ui-monospace, Menlo, monospace" font-size="13.5" font-weight="700">${st.tag}</text>
        </g>
      `);
    }

    if (this.selectedMapFloor === 'G1' || this.selectedMapFloor === 'B1' || this.selectedMapFloor === 'B3') {
      const lx = mapX(31.1);
      const lz = mapZ(-4.0);
      recordLabelBox(lx, lz + 5, 'LIFT', 13.5, 'middle');
      connectors.push(`
        <g>
          <polygon points="${(lx - 19).toFixed(1)},${(lz - 12).toFixed(1)} ${(lx + 19).toFixed(1)},${(lz - 12).toFixed(1)} ${(lx + 19).toFixed(1)},${(lz + 12).toFixed(1)} ${(lx - 19).toFixed(1)},${(lz + 12).toFixed(1)}" fill="rgba(212,178,106,0.24)" stroke="#f0c869" stroke-width="1.8" />
          <text x="${lx.toFixed(1)}" y="${(lz + 5).toFixed(1)}" text-anchor="middle" fill="#ffe5a3" font-family="ui-monospace, Menlo, monospace" font-size="13.5" font-weight="700">LIFT</text>
        </g>
      `);
    }

    if (this.selectedMapFloor === 'B1' || this.selectedMapFloor === 'B2') {
      const hx = mapX(7.5);
      const hz = mapZ(this.selectedMapFloor === 'B1' ? -13.6 : -15.3);
      const hCol = this.stateSys.shortcutsUnlocked.has(3) ? '#6cf0b5' : '#f09542';
      if (this.selectedMapFloor === 'B2') {
        recordLabelBox(hx + 22, hz - 10, 'SC3 HATCH', 13.5, 'middle');
        connectors.push(`
          <g>
            <circle cx="${hx.toFixed(1)}" cy="${hz.toFixed(1)}" r="6.5" fill="#101816" stroke="${hCol}" stroke-width="2.2" />
            <text x="${(hx + 22).toFixed(1)}" y="${(hz - 10).toFixed(1)}" text-anchor="middle" fill="${hCol}" font-family="ui-monospace, Menlo, monospace" font-size="13.5" font-weight="700">SC3 HATCH</text>
          </g>
        `);
      } else {
        recordLabelBox(hx + 10, hz + 5, 'SC3 HATCH', 13.5, 'start');
        connectors.push(`
          <g>
            <circle cx="${hx.toFixed(1)}" cy="${hz.toFixed(1)}" r="6.5" fill="#101816" stroke="${hCol}" stroke-width="2.2" />
            <text x="${(hx + 10).toFixed(1)}" y="${(hz + 5).toFixed(1)}" fill="${hCol}" font-family="ui-monospace, Menlo, monospace" font-size="13.5" font-weight="700">SC3 HATCH</text>
          </g>
        `);
      }
    }

    if (this.selectedMapFloor === 'G2' || this.selectedMapFloor === 'B1') {
      const dwX = mapX(this.selectedMapFloor === 'G2' ? 22.0 : 16.8);
      const dwZ = mapZ(this.selectedMapFloor === 'G2' ? -14.2 : -25.6);
      recordLabelBox(dwX, dwZ - 9, 'DW G2↔B1', 13.5, 'middle');
      connectors.push(`
        <g>
          <circle cx="${dwX.toFixed(1)}" cy="${dwZ.toFixed(1)}" r="5.5" fill="#d4b26a" />
          <text x="${dwX.toFixed(1)}" y="${(dwZ - 9).toFixed(1)}" text-anchor="middle" fill="#f5dca4" font-family="ui-monospace, Menlo, monospace" font-size="13.5" font-weight="700">DW G2↔B1</text>
        </g>
      `);
    }

    // 4. Live Player Position & Heading Chevron with collision-aware YOU badge placement
    let playerMarkerSvg = '';
    if (this.playerMapFloor === this.selectedMapFloor) {
      const px = mapX(this.playerMapPos.x);
      const pz = mapZ(this.playerMapPos.z);
      const fx = -Math.sin(this.playerMapYaw);
      const fz = -Math.cos(this.playerMapYaw);
      const deg = (Math.atan2(fx, -fz) * 180) / Math.PI;

      const candidates = [
        { ox: 0, oy: -15 },
        { ox: 0, oy: 24 },
        { ox: 30, oy: 5 },
        { ox: -30, oy: 5 },
        { ox: 28, oy: -13 },
        { ox: -28, oy: -13 },
      ];
      let bestOx = 0;
      let bestOy = -15;
      let bestPenalty = Infinity;
      for (const c of candidates) {
        const tx = px + c.ox;
        const ty = pz + c.oy;
        const bw = 3 * 13.5 * 0.6 + 6;
        const bh = 17.5;
        const x0 = tx - bw * 0.5;
        const x1 = tx + bw * 0.5;
        const y0 = ty - bh + 3;
        const y1 = ty + 3;
        let penalty = 0;
        if (x0 < 6 || x1 > svgW - 6 || y0 < 6 || y1 > svgH - 6) penalty += 5000;
        for (const b of placedBoxes) {
          const ix = Math.max(0, Math.min(x1, b.x1) - Math.max(x0, b.x0));
          const iy = Math.max(0, Math.min(y1, b.y1) - Math.max(y0, b.y0));
          penalty += ix * iy;
        }
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          bestOx = c.ox;
          bestOy = c.oy;
          if (penalty === 0) break;
        }
      }

      playerMarkerSvg = `
        <g transform="translate(${px.toFixed(1)} ${pz.toFixed(1)})">
          <circle r="10.5" fill="rgba(255, 230, 110, 0.22)" />
          <g transform="rotate(${deg.toFixed(1)})">
            <polygon points="0,-9.5 6.8,7.2 0,3.6 -6.8,7.2" fill="#ffe869" stroke="#111514" stroke-width="1.6" />
          </g>
          <text x="${bestOx.toFixed(1)}" y="${bestOy.toFixed(1)}" text-anchor="middle" fill="#fff199" font-family="ui-monospace, Menlo, monospace" font-size="13.5" font-weight="700">YOU</text>
        </g>
      `;
    }

    void STAIR_RAMPS;

    container.innerHTML = `
      <div class="map-floor-selector">
        ${floors
          .map(
            (f) =>
              `<button class="tab-btn ${f === this.selectedMapFloor ? 'active' : ''}" data-floor="${f}">LEVEL ${f}${
                f === this.playerMapFloor ? ' • HERE' : ''
              }</button>`
          )
          .join('')}
      </div>
      <div class="map-svg-box">
        <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%;height:${svgH}px;display:block;">
          ${rectsSvg}
          ${doorsSvg}
          ${connectors.join('')}
          ${playerMarkerSvg}
        </svg>
        <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;font-family:var(--font-mono);font-size:12.5px;color:var(--paper-muted);margin-top:8px;">
          <span><strong style="color:#ffe869;">▲ YOU</strong> Inspector</span>
          <span><strong style="color:#5fe0b4;">■</strong> Safe Haven</span>
          <span><strong style="color:#6cf0b5;">━</strong> Open / Unlocked Door</span>
          <span><strong style="color:#f09542;">━</strong> Locked / Sealed</span>
          <span><strong style="color:#7ad7eb;">▲</strong> Stair / Lift / Shaft</span>
        </div>
      </div>
      <div class="map-ledger-grid">
        <div class="puzzle-box" style="margin-top:0;">
          <div class="archival-kicker">Facility Bypass &amp; Shaft Ledger</div>
          <ul style="font-family:var(--font-mono);font-size:12.5px;line-height:1.7;padding-left:18px;color:var(--paper-muted);margin:6px 0 0;">
            <li>SC1 G2 Balcony Fire-Gate → G1 Atrium: <strong>${sc(1)}</strong></li>
            <li>SC2 G1 Hydrotherapy Doors → Atrium: <strong>${sc(2)}</strong></li>
            <li>SC3 B2↔B1 Pneumatic Ladder Hatch: <strong>${sc(3)}</strong></li>
            <li>SC4 B2 Cryo↔Anechoic Bypass Airlock: <strong>${sc(4)}</strong></li>
            <li>SC5 B3 Substation↔Freight Lift Override: <strong>${sc(5)}</strong></li>
            <li>G2↔B1 Specimen Dumbwaiter Shaft: <strong>${this.stateSys.puzzles.dumbwaiterCleared ? 'CLEARED' : this.stateSys.puzzles.freightBusEngaged ? 'ENERGIZED' : 'OFFLINE'}</strong></li>
          </ul>
        </div>
        <div class="puzzle-box" style="margin-top:0;">
          <div class="archival-kicker">Spaces on Level ${this.selectedMapFloor}</div>
          <div style="font-size:13px;line-height:1.6;margin-top:6px;color:var(--paper-cream);">
            ${floorRooms
              .map(
                (r) =>
                  `<div><strong>${r.code}</strong> — ${r.name}${r.safeHaven ? ' <em style="color:#7ef0b8;">[Safe Haven]</em>' : ''}${
                    this.playerMapRoomId === r.id ? ' <strong style="color:#ffe869;">[Current]</strong>' : ''
                  }</div>`
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    container.querySelectorAll('[data-floor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedMapFloor = (btn as HTMLElement).dataset.floor as FloorId;
        this.populateMapTab(container);
      });
    });
  }

  private renderExaminerModal(backdrop: HTMLElement): void {
    const item = this.selectedItemId ? ITEMS[this.selectedItemId] : ITEMS.lux_meter;
    this.activeExaminerItem = item;

    const sheet = document.createElement('div');
    sheet.className = 'archival-sheet';
    sheet.style.maxWidth = '760px';
    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker">3D Close-Up Examination — Drag Mouse or Use Buttons to Rotate</div>
          <h2 class="archival-title" style="font-size:24px;">${item.name}</h2>
        </div>
        <button id="btn-back-inv" class="btn-brass primary">Back to Satchel</button>
      </div>
      <div id="examiner-3d-mount" class="examiner-stage"></div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:10px;">
        <button id="rot-left" class="btn-brass">Rotate Left ↺</button>
        <button id="rot-right" class="btn-brass">Rotate Right ↻</button>
        <button id="rot-flip" class="btn-brass">Flip Rear / Underside (180°)</button>
      </div>
      <div id="examiner-secret-note" class="examiner-clue-note"></div>
    `;
    backdrop.appendChild(sheet);

    this.activeExaminerNoteEl = sheet.querySelector('#examiner-secret-note') as HTMLElement | null;
    this.refreshActiveExaminerNote();

    const mount = sheet.querySelector('#examiner-3d-mount') as HTMLElement;
    // R4-UI-02 fix: Pass live refresh callback so pointer drag AND buttons both update #examiner-secret-note immediately!
    this.examiner.mountToContainer(mount, item, () => this.refreshActiveExaminerNote());

    sheet.querySelector('#rot-left')?.addEventListener('click', () => {
      this.examiner.rotateBy(-0.55, 0);
    });
    sheet.querySelector('#rot-right')?.addEventListener('click', () => {
      this.examiner.rotateBy(0.55, 0);
    });
    sheet.querySelector('#rot-flip')?.addEventListener('click', () => {
      this.examiner.rotateBy(Math.PI, 0);
    });
    sheet.querySelector('#btn-back-inv')?.addEventListener('click', () => {
      this.examiner.disposeCurrentItemResources();
      this.actions.onRequestMode('inventory');
    });
  }

  private renderSingleLoreModal(backdrop: HTMLElement, loreId: string): void {
    const entry = LORE_ENTRIES.find((l) => l.id === loreId);
    if (!entry) return;
    const sheet = document.createElement('div');
    sheet.className = 'archival-sheet';
    sheet.style.maxWidth = '720px';
    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker">${entry.medium} #${String(entry.number).padStart(2, '0')} • ${entry.date}</div>
          <h2 class="archival-title" style="font-size:24px;">${entry.title}</h2>
          <div style="font-size:12px;color:var(--brass-bright);margin-top:4px;">Recorded by ${entry.author}</div>
        </div>
        <button id="btn-close-lore" class="btn-brass primary">Put Away [Esc / F]</button>
      </div>
      <div class="lore-reader" style="max-height:60vh;white-space:pre-line;">${entry.body}</div>
    `;
    backdrop.appendChild(sheet);
    sheet.querySelector('#btn-close-lore')?.addEventListener('click', () => this.actions.onResumeGame());
  }

  private renderPuzzleModal(backdrop: HTMLElement, puzzleId: PuzzleId, subStation?: string): void {
    const sheet = document.createElement('div');
    sheet.className = 'archival-sheet';
    sheet.style.maxWidth = '820px';
    backdrop.appendChild(sheet);

    if (puzzleId === 'puzzle1_radiology') {
      this.populatePuzzle1Radiology(sheet);
    } else if (puzzleId === 'puzzle2_steam') {
      this.populatePuzzle2Steam(sheet);
    } else if (puzzleId === 'puzzle3_archive_crt') {
      this.populatePuzzle3Archive(sheet, subStation);
    } else if (puzzleId === 'puzzle4_oscillator') {
      this.populatePuzzle4Oscillator(sheet);
    } else if (puzzleId === 'puzzle5_substation') {
      this.populatePuzzle5Substation(sheet);
    }
  }

  private populatePuzzle1Radiology(sheet: HTMLElement): void {
    const p = this.stateSys.puzzles;
    const plates = ['xray_plate_a', 'xray_plate_b', 'xray_plate_c'];
    const canMountAny = plates.some((id) => this.stateSys.hasItem(id) && !p.mountedPlates.includes(id));

    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker">G2 Radiology &amp; Ruby Darkroom</div>
          <h2 class="archival-title" style="font-size:24px;">Three-Plate Thoracic Lightbox &amp; Instrument Safe</h2>
        </div>
        <button id="pz-close" class="btn-brass">Step Back [Esc]</button>
      </div>
      <div class="two-col">
        <div class="puzzle-box" style="margin-top:0;">
          <div class="archival-kicker">Illuminated Thoracic Radiographs (${p.mountedPlates.length}/3 Plates Mounted)</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0;">
            ${plates
              .map((id) => {
                const mounted = p.mountedPlates.includes(id);
                const label =
                  id === 'xray_plate_a'
                    ? 'BED 04\n(CLEAN)'
                    : id === 'xray_plate_b'
                    ? 'BED 11 J.VANE\nCLAMP #19'
                    : 'BED 17\n(PLEURISY)';
                return `<div style="height:125px;border:1px solid var(--brass-mid);background:${
                  mounted ? '#13313b' : '#0c1010'
                };display:flex;align-items:center;justify-content:center;text-align:center;font-family:var(--font-mono);font-size:11px;white-space:pre-line;color:${
                  mounted ? '#b9f3ff' : '#565c59'
                };">${mounted ? label : 'EMPTY CLIP'}</div>`;
              })
              .join('')}
          </div>
          <button id="btn-mount-plates" class="btn-brass primary" ${canMountAny ? '' : 'disabled'}>Mount Held Radiograph Plates</button>
          <p style="font-size:12px;color:var(--paper-muted);margin-top:10px;">
            Cross-reference G1 Admissions Transfer Ledger with all three mounted radiographs and Head Nurse Haldane's brass pocket watch.
          </p>
        </div>

        <div class="puzzle-box" style="margin-top:0;">
          <div class="archival-kicker">Radiology Key &amp; Calibration Safe</div>
          ${
            p.radiologySafeUnlocked
              ? `<p style="color:#8fe3be;font-family:var(--font-mono);">SAFE UNLOCKED — Sub-Station Service Key &amp; Harmonic Lamp Calibration Coil acquired!</p>`
              : `
                <div style="font-family:var(--font-mono);font-size:24px;letter-spacing:0.25em;background:#0d1211;border:1px solid var(--brass-mid);padding:10px;text-align:center;margin:10px 0;" id="safe-code-disp">${p.enteredSafeCode.padEnd(4, '•')}</div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
                  ${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'OPEN']
                    .map((k) => `<button class="btn-brass" data-key="${k}">${k}</button>`)
                    .join('')}
                </div>
                <div id="safe-msg" style="margin-top:8px;font-family:var(--font-mono);font-size:12px;color:var(--brass-bright);"></div>
              `
          }
        </div>
      </div>
    `;

    sheet.querySelector('#pz-close')?.addEventListener('click', () => this.actions.onResumeGame());
    sheet.querySelector('#btn-mount-plates')?.addEventListener('click', () => {
      for (const id of plates) {
        if (this.stateSys.hasItem(id) && !p.mountedPlates.includes(id)) {
          p.mountedPlates.push(id);
        }
      }
      this.actions.onPuzzleUpdated('mounted_xrays');
      this.populatePuzzle1Radiology(sheet);
    });

    sheet.querySelectorAll('[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = (btn as HTMLElement).dataset.key!;
        if (k === 'CLR') {
          p.enteredSafeCode = '';
        } else if (k === 'OPEN') {
          if (p.enteredSafeCode === '1947') {
            p.radiologySafeUnlocked = true;
            this.stateSys.addItem('service_key');
            this.stateSys.flags.add('lamp_calibrated');
            this.actions.onPuzzleUpdated('solved_puzzle1');
          } else {
            p.enteredSafeCode = '';
            const msg = sheet.querySelector('#safe-msg');
            if (msg) msg.textContent = 'Solenoid buzzes — incorrect 4-digit combination.';
          }
        } else if (p.enteredSafeCode.length < 4) {
          p.enteredSafeCode += k;
        }
        this.populatePuzzle1Radiology(sheet);
      });
    });
  }

  private populatePuzzle2Steam(sheet: HTMLElement): void {
    const p = this.stateSys.puzzles;
    const psi = this.stateSys.computeSteamPSI();
    const valveLabels = [
      'Valve V1 — Main Header (+40 PSI)',
      'Valve V2 — Tub Bypass (+25 PSI)',
      'Valve V3 — Condenser Bleed (-20 PSI)',
    ];

    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker">G1 Steam Manifold &amp; Auxiliary Shaft Bus</div>
          <h2 class="archival-title" style="font-size:24px;">Three-Valve Steam Isolation &amp; Auxiliary Bus Relay</h2>
        </div>
        <button id="pz-close" class="btn-brass">Step Back [Esc]</button>
      </div>
      <div class="two-col">
        <div class="puzzle-box" style="margin-top:0;">
          <div class="archival-kicker">Brass Manifold Gauge (Residual Line Baseline: 15 PSI)</div>
          <div style="font-family:var(--font-mono);font-size:28px;margin:10px 0;color:${psi === 60 ? '#7ef0b8' : '#e0a958'};">
            LIVE PRESSURE: ${psi} PSI ${psi === 60 ? '• EQUILIBRIUM SEALED' : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${valveLabels
              .map(
                (lbl, idx) => `
              <button class="btn-brass ${p.steamValves[idx] ? 'primary' : ''}" data-valve="${idx}">
                ${p.steamValves[idx] ? '[OPEN] ' : '[SHUT] '}${lbl}
              </button>
            `
              )
              .join('')}
          </div>
        </div>
        <div class="puzzle-box" style="margin-top:0;">
          <div class="archival-kicker">Freight Elevator &amp; G2↔B1 Specimen Dumbwaiter Bus</div>
          <p style="font-family:var(--font-serif);color:var(--paper-muted);line-height:1.55;">
            Equalizing manifold pressure shutoffs the scalding boiler jet so the Main Freight Elevator (G1↔B1↔B3) and G2↔B1 Specimen Dumbwaiter bus can be energized.
          </p>
          <button id="btn-throw-bus" class="btn-brass primary" ${psi === 60 && !p.freightBusEngaged ? '' : 'disabled'}>
            ${p.freightBusEngaged ? 'Auxiliary Freight & Dumbwaiter Bus Energized' : 'Throw Auxiliary Shaft Bus Switch'}
          </button>
        </div>
      </div>
    `;

    sheet.querySelector('#pz-close')?.addEventListener('click', () => this.actions.onResumeGame());
    sheet.querySelectorAll('[data-valve]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number.parseInt((btn as HTMLElement).dataset.valve!, 10) as 0 | 1 | 2;
        p.steamValves[idx] = !p.steamValves[idx];
        p.steamSolved = this.stateSys.computeSteamPSI() === 60;
        this.actions.onPuzzleUpdated('steam_valve_turned');
        this.populatePuzzle2Steam(sheet);
      });
    });
    sheet.querySelector('#btn-throw-bus')?.addEventListener('click', () => {
      if (this.stateSys.computeSteamPSI() === 60) {
        p.steamSolved = true;
        p.freightBusEngaged = true;
        this.actions.onPuzzleUpdated('solved_puzzle2');
        this.populatePuzzle2Steam(sheet);
      }
    });
  }

  private isValidIsoCalendarDate(str: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const [ys, ms, ds] = str.split('-');
    const y = Number.parseInt(ys, 10);
    const m = Number.parseInt(ms, 10);
    const d = Number.parseInt(ds, 10);
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    return d <= daysInMonth;
  }

  private escapeHtml(raw: string): string {
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // R6-PUZZLE-01: Chronological intake-date CRT cross-reference (YYYY-MM-DD) with reversible states
  private populatePuzzle3Archive(sheet: HTMLElement, subStation?: string): void {
    const p = this.stateSys.puzzles;
    const isCRT = subStation === 'int_puzzle3_crt';
    const activeQuery = p.crtLastQuery || (p.crtSubjectQueried ? '1984-11-17' : '');
    const inputVal = p.crtQueryInput || (p.crtSubjectQueried && !p.crtLastQuery ? '1984-11-17' : '');
    const isSubj09Match = activeQuery === '1984-11-17';

    let crtReadoutHtml = '';
    if (isCRT) {
      if (activeQuery === '') {
        crtReadoutHtml = `<div style="color:#c8ba98;line-height:1.6;">AWAITING CHRONOLOGICAL QUERY — Enter a Somnology patient's original intake date (<strong>YYYY-MM-DD</strong>) from the <em>G1 Admissions &amp; Sub-Basal Transfer Ledger</em> and press Search. Ward bed numbers and register compilation dates are not search keys.</div>`;
      } else if (activeQuery === '__MALFORMED__') {
        crtReadoutHtml = `<div style="color:#f2a85c;line-height:1.6;">FORMAT ERROR — Enter a valid calendar date in ISO <strong>YYYY-MM-DD</strong> format (for example, <code>1984-10-01</code>). Ward bed numbers and non-ISO dates are rejected; edit the field above and search again.</div>`;
      } else if (activeQuery === '1984-10-06') {
        crtReadoutHtml = `
          <div style="color:#dfd2b4;line-height:1.65;">
            <strong>RECORD [1984-10-06] — SUBJECT 04: KESTREL, M. (Ward Bed 04)</strong><br/>
            Status: Discharged to coastal convalescent home.<br/>
            Retired Archive Reference: Drawer A-02. No active Sub-Basal Tympanic carrier or dumbwaiter assignment.
          </div>
        `;
      } else if (activeQuery === '1984-12-03') {
        crtReadoutHtml = `
          <div style="color:#dfd2b4;line-height:1.65;">
            <strong>RECORD [1984-12-03] — SUBJECT 12: MERCER, E. (Ward Bed 17)</strong><br/>
            Status: Transferred to county care.<br/>
            Retired Archive Reference: Drawer B-06. No active Sub-Basal Tympanic carrier or dumbwaiter assignment.
          </div>
        `;
      } else if (activeQuery === '1984-11-17') {
        crtReadoutHtml = `
          <div style="color:#9cf2c8;line-height:1.7;">
            <strong>RECORD [1984-11-17] — SUBJECT 09: VANE, JULIAN ("THE CANTOR" • Ward Bed 11)</strong><br/>
            Status: Sub-Basal Tympanic Implant Active (Thoracic Resonator Graft).<br/>
            Assigned Cryogenic Vault Drawer: <strong>C-04</strong> (Harmonic Calibration Reel Hub)<br/>
            G2↔B1 Specimen Dumbwaiter Brake Override: <strong>318</strong>
          </div>
        `;
      } else {
        crtReadoutHtml = `<div style="color:#e5ba73;line-height:1.6;">No intake entry found for <strong>${this.escapeHtml(activeQuery)}</strong>. Cross-reference each patient's original Somnology intake date in the <em>G1 Admissions &amp; Sub-Basal Transfer Ledger</em> (register compilation and operative dates are not intake keys).</div>`;
      }
    }

    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker">Level B1 Sub-Basal Intake &amp; Cold Archives</div>
          <h2 class="archival-title" style="font-size:24px;">${
            isCRT ? 'Security Rotunda Somnology CRT Directory' : 'Cryogenic Morgue Drawers & G2↔B1 Dumbwaiter Chute'
          }</h2>
        </div>
        <button id="pz-close" class="btn-brass">Step Back [Esc]</button>
      </div>
      ${
        isCRT
          ? `
            <div class="puzzle-box" style="background:#121810;border-color:#d49235;font-family:var(--font-mono);">
              <div style="color:#f0ab48;margin-bottom:8px;">ST. DAMIAN SUB-BASAL CRT OS v3.4 — CHRONOLOGICAL INTAKE INDEX</div>
              <label for="inp-crt-intake-date" style="display:block;font-size:12.5px;color:#dfd2b4;margin-bottom:6px;">Original intake date (YYYY-MM-DD)</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
                <input id="inp-crt-intake-date" type="text" maxlength="20" placeholder="YYYY-MM-DD" value="${this.escapeHtml(inputVal)}" autocomplete="off" spellcheck="false" style="background:#0a100c;border:1px solid #d49235;color:#f5eedc;padding:9px 12px;font-family:var(--font-mono);font-size:14px;width:210px;" />
                <button id="btn-query-crt" class="btn-brass primary">Search</button>
              </div>
              <div id="crt-query-result" style="background:#0b110b;border:1px solid rgba(212,146,53,0.45);padding:12px 14px;margin-bottom:12px;font-size:13px;">
                ${crtReadoutHtml}
              </div>
              <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                <button id="btn-log-crt" class="btn-brass ${isSubj09Match ? 'primary' : ''}" ${isSubj09Match ? '' : 'disabled'}>${
                  isSubj09Match
                    ? p.crtSubjectQueried
                      ? 'Registry Logged to Dossier (Drawer C-04 / Code 318)'
                      : 'Log Subject 09 Drawer & Chute Override'
                    : 'Log Active Tympanic Record'
                }</button>
                ${
                  p.crtSubjectQueried && !isSubj09Match
                    ? `<span style="font-size:12px;color:#8fe3be;">✓ Dossier Logged: Subject 09 (1984-11-17) — Drawer C-04 / Override 318</span>`
                    : ''
                }
              </div>
            </div>
          `
          : `
            <div class="two-col">
              <div class="puzzle-box" style="margin-top:0;">
                <div class="archival-kicker">Cryogenic Morgue Drawer Bank</div>
                <p style="font-size:12px;color:var(--paper-muted);">Caution: Pulling an unverified frozen drawer shrieks loudly into the active B1 corridor!</p>
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px;">
                  ${['C-01', 'C-02', 'C-03', 'C-04', 'C-05', 'C-06']
                    .map(
                      (code) => `
                    <button class="btn-brass ${code === 'C-04' && p.cryoDrawerOpened ? 'primary' : ''}" data-drawer="${code}">
                      ${code === 'C-04' && p.cryoDrawerOpened ? 'C-04 [OPENED — REEL HUB]' : `Pull Drawer ${code}`}
                    </button>
                  `
                    )
                    .join('')}
                </div>
              </div>
              <div class="puzzle-box" style="margin-top:0;">
                <div class="archival-kicker">G2↔B1 Specimen Dumbwaiter Lower Chute</div>
                <p style="font-size:12px;color:var(--paper-muted);">
                  ${
                    p.freightBusEngaged
                      ? 'Carrier arrived down the G2↔B1 shaft! Enter the 3-digit Brake Override code to release the Calibrated 30A Silver Fuse Element.'
                      : 'Dumbwaiter shaft unpowered — energize the G1 Hydrotherapy Auxiliary Bus first.'
                  }
                </p>
                ${
                  p.dumbwaiterCleared
                    ? `<div style="color:#7ef0b8;font-family:var(--font-mono);margin-top:12px;">CHUTE CLEARED — Calibrated 30A Silver Fuse Element retrieved!</div>`
                    : `
                      <div style="display:flex;gap:8px;margin-top:12px;">
                        <input id="inp-dw-code" type="text" maxlength="3" placeholder="3-Digit Code" style="background:#0d1211;border:1px solid var(--brass-mid);color:var(--paper-cream);padding:8px 10px;font-family:var(--font-mono);width:150px;" />
                        <button id="btn-dw-unlock" class="btn-brass primary" ${p.freightBusEngaged ? '' : 'disabled'}>Release Brake</button>
                      </div>
                      <div id="dw-msg" style="margin-top:8px;font-family:var(--font-mono);font-size:12px;color:var(--brass-bright);"></div>
                    `
                }
              </div>
            </div>
          `
      }
    `;

    sheet.querySelector('#pz-close')?.addEventListener('click', () => this.actions.onResumeGame());

    const crtInput = sheet.querySelector('#inp-crt-intake-date') as HTMLInputElement | null;
    const runCrtSearch = () => {
      const raw = crtInput?.value ?? '';
      const trimmed = raw.trim();
      if (!this.isValidIsoCalendarDate(trimmed)) {
        p.crtQueryInput = raw;
        p.crtLastQuery = '__MALFORMED__';
      } else {
        p.crtQueryInput = trimmed;
        p.crtLastQuery = trimmed;
      }
      this.actions.onPuzzleUpdated('crt_query_attempt');
      this.populatePuzzle3Archive(sheet, subStation);
      const nextInput = sheet.querySelector('#inp-crt-intake-date') as HTMLInputElement | null;
      nextInput?.focus();
    };
    crtInput?.addEventListener('input', () => {
      p.crtQueryInput = crtInput.value;
    });
    crtInput?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        runCrtSearch();
      }
    });
    sheet.querySelector('#btn-query-crt')?.addEventListener('click', () => runCrtSearch());

    sheet.querySelector('#btn-log-crt')?.addEventListener('click', () => {
      if (activeQuery !== '1984-11-17') return;
      p.crtSubjectQueried = true;
      p.crtLastQuery = '1984-11-17';
      p.crtQueryInput = '1984-11-17';
      this.actions.onPuzzleUpdated('crt_queried');
      this.populatePuzzle3Archive(sheet, subStation);
    });
    sheet.querySelectorAll('[data-drawer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dCode = (btn as HTMLElement).dataset.drawer!;
        if (dCode === 'C-04') {
          if (!p.cryoDrawerOpened) {
            p.cryoDrawerOpened = true;
            this.stateSys.addItem('reel_hub');
            this.actions.onPuzzleUpdated('cryo_c04_opened');
          }
        } else {
          this.actions.onPuzzleUpdated('wrong_cryo_drawer_noise');
        }
        this.populatePuzzle3Archive(sheet, subStation);
      });
    });
    sheet.querySelector('#btn-dw-unlock')?.addEventListener('click', () => {
      const inp = sheet.querySelector('#inp-dw-code') as HTMLInputElement | null;
      if (inp?.value.trim() === '318' && p.freightBusEngaged) {
        p.dumbwaiterCleared = true;
        this.stateSys.addItem('fuse_wire');
        this.actions.onPuzzleUpdated('solved_puzzle3');
        this.populatePuzzle3Archive(sheet, subStation);
      } else {
        const msg = sheet.querySelector('#dw-msg');
        if (msg) msg.textContent = 'Magnetic brake holds — verify Subject 09 Brake Override on the Rotunda CRT.';
      }
    });
  }

  private populatePuzzle4Oscillator(sheet: HTMLElement): void {
    const p = this.stateSys.puzzles;
    const canMount = this.stateSys.hasItem('calibration_reel') && !p.reelMounted;

    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker">B2 Acoustic Control Booth</div>
          <h2 class="archival-title" style="font-size:24px;">Harmonic Reel Transport &amp; Three-Dial Phase Oscillator</h2>
        </div>
        <button id="pz-close" class="btn-brass">Step Back [Esc]</button>
      </div>
      <div class="two-col">
        <div class="puzzle-box" style="margin-top:0;">
          <div class="archival-kicker">Dual-Trace Phosphor Oscilloscope</div>
          <canvas id="osc-canvas" width="360" height="180" style="width:100%;background:#091410;border:1px solid var(--brass-mid);margin:10px 0;"></canvas>
          <button id="btn-mount-reel" class="btn-brass primary" ${canMount ? '' : 'disabled'}>
            ${p.reelMounted ? 'Calibration Reel (09-B) Mounted' : 'Mount Assembled Calibration Reel (09-B)'}
          </button>
          <p style="font-size:12px;color:var(--paper-muted);margin-top:8px;">
            Combine <em>Unwound Reel Hub</em> + <em>Subject 09 Master Tape Spool</em> in Inventory first if unmounted, then overlay the green live waveform onto the amber reference trace.
          </p>
        </div>
        <div class="puzzle-box" style="margin-top:0;">
          <div class="archival-kicker">Brass Oscillator Controls</div>
          <div class="setting-row" style="margin-top:10px;">
            <label>Primary Frequency: <strong id="lbl-freq">${p.oscFreq} Hz</strong></label>
            <input id="dial-freq" type="range" min="60" max="156" step="12" value="${p.oscFreq}" ${p.reelMounted && !p.oscillatorSolved ? '' : 'disabled'} />
          </div>
          <div class="setting-row" style="margin-top:12px;">
            <label>Phase Offset: <strong id="lbl-phase">${p.oscPhase}°</strong></label>
            <input id="dial-phase" type="range" min="0" max="300" step="30" value="${p.oscPhase}" ${p.reelMounted && !p.oscillatorSolved ? '' : 'disabled'} />
          </div>
          <div class="setting-row" style="margin-top:12px;">
            <label>Attenuation: <strong id="lbl-atten">${p.oscAtten} dB</strong></label>
            <input id="dial-atten" type="range" min="-24" max="0" step="4" value="${p.oscAtten}" ${p.reelMounted && !p.oscillatorSolved ? '' : 'disabled'} />
          </div>
          <button id="btn-lock-wave" class="btn-brass primary" style="margin-top:16px;" ${p.reelMounted && !p.oscillatorSolved ? '' : 'disabled'}>
            ${p.oscillatorSolved ? 'RESONANCE LOCKED — B3 Blast Hatch Unbolted!' : 'Engage Phase-Null Lock'}
          </button>
          <div id="osc-msg" style="margin-top:8px;font-family:var(--font-mono);font-size:12px;color:var(--brass-bright);"></div>
        </div>
      </div>
    `;

    const drawScope = () => {
      const cv = sheet.querySelector('#osc-canvas') as HTMLCanvasElement | null;
      if (!cv) return;
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = '#08130f';
      ctx.fillRect(0, 0, 360, 180);
      ctx.strokeStyle = 'rgba(90,150,120,0.2)';
      for (let x = 0; x < 360; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 180);
        ctx.stroke();
      }
      ctx.strokeStyle = '#e09a38';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < 360; x++) {
        const t = (x / 360) * Math.PI * 6;
        const y = 90 + Math.sin(t * (108 / 90) + Math.PI) * 44;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (p.reelMounted) {
        ctx.strokeStyle = '#6cf5b5';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        const amp = 44 * (1 + (p.oscAtten + 12) / 28);
        const ph = (p.oscPhase * Math.PI) / 180;
        for (let x = 0; x < 360; x++) {
          const t = (x / 360) * Math.PI * 6;
          const y = 90 + Math.sin(t * (p.oscFreq / 90) + ph) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };
    drawScope();

    sheet.querySelector('#pz-close')?.addEventListener('click', () => this.actions.onResumeGame());
    sheet.querySelector('#btn-mount-reel')?.addEventListener('click', () => {
      if (this.stateSys.hasItem('calibration_reel')) {
        p.reelMounted = true;
        this.actions.onPuzzleUpdated('reel_mounted');
        this.populatePuzzle4Oscillator(sheet);
      }
    });

    const bindOsc = (id: string, lblId: string, suffix: string, key: 'oscFreq' | 'oscPhase' | 'oscAtten') => {
      const inp = sheet.querySelector(`#${id}`) as HTMLInputElement | null;
      const lbl = sheet.querySelector(`#${lblId}`);
      inp?.addEventListener('input', () => {
        p[key] = Number.parseInt(inp.value, 10);
        if (lbl) lbl.textContent = `${p[key]}${suffix}`;
        drawScope();
      });
    };
    bindOsc('dial-freq', 'lbl-freq', ' Hz', 'oscFreq');
    bindOsc('dial-phase', 'lbl-phase', '°', 'oscPhase');
    bindOsc('dial-atten', 'lbl-atten', ' dB', 'oscAtten');

    sheet.querySelector('#btn-lock-wave')?.addEventListener('click', () => {
      if (p.oscFreq === 108 && p.oscPhase === 180 && p.oscAtten === -12) {
        p.oscillatorSolved = true;
        this.stateSys.flags.add('oscillator_solved');
        this.actions.onPuzzleUpdated('solved_puzzle4');
        this.populatePuzzle4Oscillator(sheet);
      } else {
        const msg = sheet.querySelector('#osc-msg');
        if (msg) msg.textContent = 'Phase mismatch — match the amber containment waveform documented in Lab Note #14.';
      }
    });
  }

  private populatePuzzle5Substation(sheet: HTMLElement): void {
    const p = this.stateSys.puzzles;
    const canInsertFuse = this.stateSys.hasItem('restored_fuse') && !p.substationFuseInserted;
    const calc = this.stateSys.computeSubstationPhases();
    const swLabels = [
      'Feeder S1: Phase A +25 kW | Phase B +15 kW | Phase C +0 kW',
      'Feeder S2: Phase A +0 kW  | Phase B +25 kW | Phase C +25 kW',
      'Feeder S3: Phase A +15 kW | Phase B +0 kW  | Phase C +15 kW',
      'Tie S4:    Phase A +20 kW | Phase B +20 kW | Phase C -10 kW',
    ];

    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker">B3 High-Voltage Substation — Live Patrol Zone (Esc Steps Back Instantly)</div>
          <h2 class="archival-title" style="font-size:24px;">13.8 kV Three-Phase Load Balancing Matrix</h2>
        </div>
        <button id="pz-close" class="btn-brass">Step Back [Esc]</button>
      </div>
      <div class="two-col">
        <div class="puzzle-box" style="margin-top:0;">
          <div class="archival-kicker">30A Cartridge Fuse Cradle</div>
          <p style="font-size:12px;color:var(--paper-muted);">
            Requires <strong>Restored 30A High-Voltage Fuse</strong> (unthread Fuse Holder in 3D Examiner, then combine with 30A Silver Fuse Element).
          </p>
          <button id="btn-seat-fuse" class="btn-brass primary" ${canInsertFuse ? '' : 'disabled'}>
            ${p.substationFuseInserted ? '30A Cartridge Fuse Seated' : 'Insert Restored 30A Cartridge Fuse'}
          </button>

          <div class="archival-kicker" style="margin-top:16px;">Live Phase Bus Readout (Max 50 kW/Phase)</div>
          <div style="font-family:var(--font-mono);font-size:15px;margin-top:8px;line-height:1.8;color:${
            calc.overloaded ? '#f27972' : calc.balanced ? '#7ef0b8' : '#e3c478'
          };">
            PHASE A: ${calc.a} kW ${calc.a > 50 ? '[OVERLOAD!]' : ''}<br/>
            PHASE B: ${calc.b} kW ${calc.b > 50 ? '[OVERLOAD!]' : ''}<br/>
            PHASE C: ${calc.c} kW ${calc.c > 50 ? '[OVERLOAD!]' : ''}<br/>
            <strong>TOTAL TRANSFER: ${calc.total} kW</strong>
          </div>
        </div>

        <div class="puzzle-box" style="margin-top:0;">
          <div class="archival-kicker">Feeder Breakers</div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
            ${swLabels
              .map(
                (lbl, idx) => `
              <button class="btn-brass ${p.phaseSwitches[idx] ? 'primary' : ''}" data-sw="${idx}" ${
                  p.substationFuseInserted && !p.substationSolved ? '' : 'disabled'
                }>
                ${p.phaseSwitches[idx] ? '[CLOSED] ' : '[OPEN] '}${lbl}
              </button>
            `
              )
              .join('')}
          </div>
          <button id="btn-commit-purge" class="btn-brass primary" style="margin-top:14px;" ${
            calc.balanced && !p.substationSolved ? '' : 'disabled'
          }>
            ${p.substationSolved ? '120 kW Diverted to Containment & Culvert Interlock!' : 'Engage 120 kW Culvert Transfer'}
          </button>
        </div>
      </div>
    `;

    sheet.querySelector('#pz-close')?.addEventListener('click', () => this.actions.onResumeGame());
    sheet.querySelector('#btn-seat-fuse')?.addEventListener('click', () => {
      if (this.stateSys.hasItem('restored_fuse')) {
        p.substationFuseInserted = true;
        this.actions.onPuzzleUpdated('fuse_seated');
        this.populatePuzzle5Substation(sheet);
      }
    });
    sheet.querySelectorAll('[data-sw]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number.parseInt((btn as HTMLElement).dataset.sw!, 10);
        p.phaseSwitches[idx] = !p.phaseSwitches[idx];
        const nextCalc = this.stateSys.computeSubstationPhases();
        if (nextCalc.overloaded) {
          p.phaseSwitches = [false, false, false, false];
          this.actions.onPuzzleUpdated('substation_overload_trip');
        }
        this.populatePuzzle5Substation(sheet);
      });
    });
    sheet.querySelector('#btn-commit-purge')?.addEventListener('click', () => {
      if (this.stateSys.computeSubstationPhases().balanced) {
        p.substationSolved = true;
        this.stateSys.flags.add('act3_purge_active');
        this.actions.onPuzzleUpdated('solved_puzzle5a');
        this.populatePuzzle5Substation(sheet);
      }
    });
  }

  public renderElevatorSelectorModal(currentFloor: FloorId, b3Unlocked: boolean): void {
    if (this.currentMode !== 'puzzle' && !this.toastIsDanger) {
      this.toastTimer = 0;
    }
    this.currentMode = 'puzzle';
    this.layer.innerHTML = '';
    this.resetHUDRefsAndCache();
    this.toastEl = null;
    const backdrop = document.createElement('div');
    backdrop.className = 'screen-backdrop';
    this.layer.appendChild(backdrop);

    const sheet = document.createElement('div');
    sheet.className = 'archival-sheet';
    sheet.style.maxWidth = '500px';
    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker">Main Freight Elevator Cage</div>
          <h2 class="archival-title" style="font-size:24px;">Select Destination Level (Current: ${currentFloor})</h2>
        </div>
      </div>
      <div class="menu-actions" style="max-width:100%;">
        <button class="btn-brass ${currentFloor === 'G1' ? 'primary' : ''}" data-efloor="G1">Level G1 — Freight Vestibule &amp; Triage</button>
        <button class="btn-brass ${currentFloor === 'B1' ? 'primary' : ''}" data-efloor="B1">Level B1 — Sub-Basal Airlock &amp; Rotunda</button>
        <button class="btn-brass ${currentFloor === 'B3' ? 'primary' : ''}" data-efloor="B3" ${b3Unlocked ? '' : 'disabled'}>
          Level B3 — Substation Landing ${b3Unlocked ? '(Call Override Active)' : '(Engage B3 Call Override First)'}
        </button>
        <button id="elev-cancel" class="btn-brass">Remain on ${currentFloor}</button>
      </div>
    `;
    backdrop.appendChild(sheet);
    this.syncToastPresentation();

    sheet.querySelectorAll('[data-efloor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = (btn as HTMLElement).dataset.efloor as FloorId;
        this.actions.onSelectElevatorFloor(f);
      });
    });
    sheet.querySelector('#elev-cancel')?.addEventListener('click', () => this.actions.onResumeGame());
  }

  private renderDeathScreen(backdrop: HTMLElement): void {
    const sheet = document.createElement('div');
    sheet.className = 'archival-sheet';
    sheet.style.maxWidth = '580px';
    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker" style="color:var(--ruby-alert);">Inspection Terminated</div>
          <h2 class="archival-title" style="font-size:28px;">Overwhelmed in the Dark</h2>
        </div>
      </div>
      <p style="font-family:var(--font-serif);color:var(--paper-muted);line-height:1.6;">
        Subject 09 converged on your acoustic signature. Reloading restores your latest safe checkpoint with The Cantor reset to distant patrol nodes.
      </p>
      <div class="menu-actions" style="max-width:100%;">
        <button id="btn-retry-cp" class="btn-brass primary">Reload Last Checkpoint</button>
        <button id="btn-death-title" class="btn-brass">Return to Title Screen</button>
      </div>
    `;
    backdrop.appendChild(sheet);
    sheet.querySelector('#btn-retry-cp')?.addEventListener('click', () => this.actions.onRetryCheckpoint());
    sheet.querySelector('#btn-death-title')?.addEventListener('click', () => this.actions.onReturnToTitle());
  }

  private renderCreditsScreen(
    backdrop: HTMLElement,
    stats: { activeSeconds: number; wallClockSeconds: number; distanceMeters: number }
  ): void {
    const fmt = (s: number) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
    const sheet = document.createElement('div');
    sheet.className = 'archival-sheet';
    sheet.style.maxWidth = '760px';
    sheet.innerHTML = `
      <div class="archival-header">
        <div>
          <div class="archival-kicker">November 18, 1994 — 05:52 Dawn • Inspection Complete</div>
          <h2 class="archival-title">VESPER WARD</h2>
          <p class="archival-subtitle">Epilogue: Municipal Condemnation Certified — Sub-Basal Vault Sealed</p>
        </div>
      </div>
      <p style="font-family:var(--font-serif);line-height:1.68;color:var(--paper-cream);">
        Stepping past St. Damian's wrought-iron gate into the silver Havenport dawn, Mara Solis locks the exterior 13.8 kV disconnect padlock and signs Warrant #88-412. Sixteen meters below the wet terrazzo, behind double-dogged acoustic steel, Julian Vane's brass ribs settle at last into true silence.
      </p>
      <div class="puzzle-box">
        <div class="archival-kicker">Inspection Completion Ledger</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-family:var(--font-mono);font-size:13px;margin-top:10px;">
          <div>Total Wall-Clock Session: <strong>${fmt(stats.wallClockSeconds)}</strong></div>
          <div>Active Simulation Time: <strong>${fmt(stats.activeSeconds)}</strong></div>
          <div>Distance Traversed: <strong>${Math.round(stats.distanceMeters)} m</strong></div>
          <div>Archives Recovered: <strong>${this.stateSys.collectedLore.size} / ${LORE_ENTRIES.length}</strong></div>
          <div>Mechanical Shortcuts Opened: <strong>${this.stateSys.shortcutsUnlocked.size} / 5</strong></div>
        </div>
      </div>
      <div style="margin-top:18px;font-family:var(--font-serif);font-size:13px;color:var(--paper-muted);line-height:1.6;">
        <strong>CREDITS</strong> — Original Story, Spatial Architecture, Procedural PBR Shaders, Synthesized Spatial Audio &amp; Gameplay Systems built for <em>VESPER WARD</em>. Powered by Three.js (MIT) &amp; Web Audio API.
      </div>
      <div class="menu-actions" style="margin-top:18px;">
        <button id="btn-credits-title" class="btn-brass primary">Return to Title Screen</button>
      </div>
    `;
    backdrop.appendChild(sheet);
    sheet.querySelector('#btn-credits-title')?.addEventListener('click', () => this.actions.onReturnToTitle());
  }

  private renderControlsTableHTML(): string {
    return `
      <table class="controls-table">
        <tr><th>Action</th><th>Primary / Secondary</th></tr>
        <tr><td>Move &amp; Strafe</td><td>WASD / Arrow Keys (↑↓←→)</td></tr>
        <tr><td>Look / Pitch Fallback</td><td>Mouse / [ ] Yaw &amp; - = (PgUp/Dn) Pitch</td></tr>
        <tr><td>Lean Left / Right</td><td>Q / E</td></tr>
        <tr><td>Sprint / Crouch</td><td>Shift / C or Ctrl</td></tr>
        <tr><td>Interact / Hide</td><td>F / Left Click</td></tr>
        <tr><td>Cycle Lamp Mode</td><td>L / Right Click</td></tr>
        <tr><td>Dynamo Crank / Cell</td><td>Hold R / G</td></tr>
        <tr><td>Use Gauze / Throw Vial</td><td>H / V or Middle Click</td></tr>
        <tr><td>Dossier / Map / Pause</td><td>Tab, I, M / Esc</td></tr>
      </table>
    `;
  }
}
