import './styles/main.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

import { AABB, CantorState, FloorId, GameMode, PuzzleId, SaveSnapshot, Vec3 } from './core/types';
import { resolveSeedFromURL } from './core/rng';
import { SettingsManager } from './core/settings';
import { createInitialPuzzleState, SaveSystem } from './core/saveSystem';
import { ProceduralMaterialLibrary } from './assets/proceduralTextures';
import { SpatialAudioEngine } from './assets/audioEngine';
import { DOORS, ELEVATOR_FLOORS_Y, ROOMS } from './world/worldHelpers';
import { ITEMS } from './world/itemsAndLore';
import { WorldBuilder } from './world/worldBuilder';
import { ItemExaminer3D } from './world/itemExaminer3D';
import { PlayerController, PlayerInputState } from './systems/playerController';
import { LuxMeterSystem } from './systems/luxMeter';
import { CantorAISystem } from './systems/cantorAI';
import { GameplayStateAndPuzzleSystem } from './systems/puzzleSystem';
import { UIManager } from './ui/uiManager';

interface ThrownVial {
  mesh: THREE.Mesh;
  pos: Vec3;
  vel: Vec3;
  age: number;
}

interface ActiveLadderClimb {
  direction: 'up' | 'down';
  elapsed: number;
  duration: number;
  startPos: Vec3;
  shaftEntryPos: Vec3;
  shaftExitPos: Vec3;
  endPos: Vec3;
  endYaw: number;
  lastRungStep: number;
}

const AtmosphericGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uGamma: { value: 1.06 },
    uVignette: { value: 0.22 },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uGamma;
    uniform float uVignette;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      // Input tDiffuse is already ACES-tonemapped sRGB from OutputPass!
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 centered = vUv - 0.5;
      float vig = 1.0 - dot(centered, centered) * uVignette;
      vec3 col = max(texel.rgb * vig, vec3(0.0));
      // User gamma calibration relative to 1.0 baseline + non-crushed shadow floor
      col = pow(clamp(col + vec3(0.012), 0.0, 1.0), vec3(1.0 / max(0.65, uGamma)));
      float grain = (fract(sin(dot(vUv + fract(uTime * 0.13), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.012;
      gl_FragColor = vec4(clamp(col + grain, 0.0, 1.0), 1.0);
    }
  `,
};

class VesperWardGame {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private outputPass: OutputPass;
  private gradePass: ShaderPass;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private hemiLight: THREE.HemisphereLight;

  private seed: number;
  private qaEnabled: boolean;
  private settingsMgr: SettingsManager;
  private saveSys: SaveSystem;
  private mats: ProceduralMaterialLibrary;
  private audio: SpatialAudioEngine;
  private world: WorldBuilder;
  private player: PlayerController;
  private lux: LuxMeterSystem;
  private cantor: CantorAISystem;
  private stateSys: GameplayStateAndPuzzleSystem;
  private examiner: ItemExaminer3D;
  private ui: UIManager;

  // Dynamic safety colliders preventing walking into an empty elevator shaft when cab is on another floor
  private shaftGuardColliders: Record<'G1' | 'B1' | 'B3', AABB>;

  private mode: GameMode = 'title';
  private activePuzzleContext?: { puzzleId: PuzzleId; subStation?: string };
  private activeLoreModalId?: string;
  private elapsedTotal = 0;
  private activeSimulationSeconds = 0;
  private sessionWallClockSeconds = 0;
  private currentElevatorFloor: FloorId = 'G1';
  private elevatorInTransitTo: FloorId | null = null;
  private activeLadderClimb: ActiveLadderClimb | null = null;
  private safeHavenStabilizeAccum = 0;

  // R5-INPUT-01: Native pointer-lock tracking so physical Escape pauses immediately on first press
  private hadPointerLock = false;
  private programmaticPointerUnlock = false;
  private lastPointerUnlockPauseAt = -1000;

  private hoveredTarget: { type: 'door' | 'interactable' | 'hiding'; id: string; label: string } | null = null;
  private thrownVials: ThrownVial[] = [];
  private sharedVialGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.18, 12);
  private autoCheckpointsHit = new Set<string>();
  private tmpWorldPos = new THREE.Vector3();
  private tmpCamForward = new THREE.Vector3();
  private tmpHoverDir = new THREE.Vector3();

  private input: PlayerInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    crouchHeld: false,
    leanLeft: false,
    leanRight: false,
  };
  private crankHeld = false;
  private keyTurnLeft = false;
  private keyTurnRight = false;
  private keyPitchUp = false;
  private keyPitchDown = false;

  private frameTimesMs: number[] = [];
  private lastSceneDrawCalls = 0;
  private lastSceneTriangles = 0;
  private lastTotalDrawCalls = 0;
  private lastTotalTriangles = 0;
  private rendererUnmasked = 'WebGL2 Hardware';
  private vendorUnmasked = 'Browser GPU';
  private qaAudit = {
    teleportsUsed: 0,
    stateInjectionsUsed: 0,
    programmaticLookCalls: 0,
    inputEventsProcessed: 0,
  };

  constructor() {
    const { seed, qaEnabled } = resolveSeedFromURL();
    this.seed = seed;
    this.qaEnabled = qaEnabled;

    this.canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.info.autoReset = false;

    this.inspectWebGLCapabilities();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f181c);
    this.scene.fog = new THREE.FogExp2(0x121e24, 0.026);
    this.scene.onAfterRender = () => {
      this.lastSceneDrawCalls = this.renderer.info.render.calls;
      this.lastSceneTriangles = this.renderer.info.render.triangles;
    };

    this.settingsMgr = new SettingsManager();
    const initSettings = this.settingsMgr.get();

    this.camera = new THREE.PerspectiveCamera(
      initSettings.fov,
      window.innerWidth / window.innerHeight,
      0.08,
      95
    );

    this.hemiLight = new THREE.HemisphereLight(0x668496, 0x2d3532, 0.92);
    this.scene.add(this.hemiLight);

    // Full PBR Post-Processing Chain (half-res bloom reduces fill-rate pressure while preserving specular glow)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        Math.max(1, Math.floor(window.innerWidth * 0.5)),
        Math.max(1, Math.floor(window.innerHeight * 0.5))
      ),
      0.22,
      0.5,
      0.85
    );
    this.composer.addPass(this.bloomPass);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
    this.gradePass = new ShaderPass(AtmosphericGradeShader);
    this.gradePass.uniforms.uGamma.value = initSettings.gamma;
    this.composer.addPass(this.gradePass);

    this.saveSys = new SaveSystem();
    this.mats = new ProceduralMaterialLibrary(this.seed);
    this.stateSys = new GameplayStateAndPuzzleSystem(createInitialPuzzleState());

    this.audio = new SpatialAudioEngine(initSettings, (text, danger) => {
      this.ui.pushCaption(text, danger);
    });

    this.world = new WorldBuilder(this.mats);
    this.world.buildAll();
    this.scene.add(this.world.root);

    this.shaftGuardColliders = {
      G1: { minX: 28.38, maxX: 28.62, minY: -9999, maxY: -9998, minZ: -5.2, maxZ: -2.8, blocksLOS: false },
      B1: { minX: 28.38, maxX: 28.62, minY: -5.5, maxY: -2.8, minZ: -5.2, maxZ: -2.8, blocksLOS: false },
      B3: { minX: 28.38, maxX: 28.62, minY: -16.5, maxY: -13.8, minZ: -5.2, maxZ: -2.8, blocksLOS: false },
    };
    this.world.staticColliders.push(
      this.shaftGuardColliders.G1,
      this.shaftGuardColliders.B1,
      this.shaftGuardColliders.B3
    );

    this.player = new PlayerController();
    this.lux = new LuxMeterSystem(this.camera, this.scene, this.mats);
    this.cantor = new CantorAISystem(this.mats);
    this.scene.add(this.cantor.meshGroup);
    this.scene.add(this.cantor.rigLight);

    this.examiner = new ItemExaminer3D(
      this.mats,
      (flag) => this.stateSys.flags.has(flag),
      (flag, msg) => {
        this.stateSys.flags.add(flag);
        this.audio.playInteraction('pickup');
        this.ui.refreshActiveExaminerNote();
        if (this.mode === 'playing') {
          this.ui.showToast(msg, 5.0);
        }
      }
    );

    const uiLayer = document.getElementById('ui-layer') as HTMLElement;
    this.ui = new UIManager(uiLayer, this.settingsMgr, this.stateSys, this.examiner, {
      onStartNewGame: () => this.startNewGame(),
      onContinueGame: () => {
        const snap = this.saveSys.loadLatest();
        if (snap) this.restoreSnapshot(snap);
      },
      onResumeGame: () => this.setMode('playing'),
      onReturnToTitle: () => {
        this.exitPointerLockSafe();
        this.setMode('title');
      },
      onRetryCheckpoint: () => {
        const snap = this.saveSys.loadLatest();
        if (snap) this.restoreSnapshot(snap);
        else this.startNewGame();
      },
      onUnstuck: () => {
        this.activeLadderClimb = null;
        const room = this.player.unstuckToSafeEntry();
        this.setMode('playing');
        this.ui.showToast(`Repositioned safely to ${room.name} threshold.`);
      },
      onRequestMode: (targetMode) => this.setMode(targetMode, this.activePuzzleContext, this.activeLoreModalId),
      onUseConsumable: (itemId) => this.useConsumableQuick(itemId),
      onCombineItems: (a, b) => {
        const res = this.stateSys.tryCombine(a, b);
        if (res.ok) this.audio.playInteraction('pickup');
        return res;
      },
      onSelectElevatorFloor: (floor) => this.travelElevatorTo(floor),
      onPuzzleUpdated: (ev) => this.handlePuzzleEvent(ev),
    });

    this.settingsMgr.onChange((s) => {
      this.camera.fov = s.fov;
      this.camera.updateProjectionMatrix();
      this.gradePass.uniforms.uGamma.value = s.gamma;
      this.audio.applySettings(s);
    });

    this.bindInputListeners();
    this.installQABridge();
    this.prewarmGPUResources();
    this.positionTitleBackdropCamera();
    this.setMode('title');
    this.lastFrameTs = performance.now();
    this.animate(this.lastFrameTs);
  }

  // R5-PERF-02 fix: Complete 1-pass unculled VAO, texture, and Metal PSO warmup BEFORE Title mounts #btn-new-game!
  // Because WorldBuilder + Lux + Cantor maintain a 100% constant light/shadow topology, 1 unculled pass compiles ALL shaders!
  private prewarmGPUResources(): void {
    try {
      for (const tex of this.mats.getAllTextures()) {
        this.renderer.initTexture(tex);
      }

      const restoreWorldVis = this.world.prepareAllObjectsForPrewarm();
      const prevCantorVis = this.cantor.meshGroup.visible;
      const prevLuxVis = this.lux.viewModel.visible;
      this.cantor.meshGroup.visible = true;
      this.lux.viewModel.visible = true;

      // Temporarily add a dummy vial mesh so sharedVialGeo is also VAO-uploaded at startup
      const dummyVial = new THREE.Mesh(this.sharedVialGeo, this.mats.getMaterial('frosted_glass'));
      this.scene.add(dummyVial);

      const savedFrustum: Array<{ obj: THREE.Object3D; fc: boolean }> = [];
      this.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh || (obj as THREE.LineSegments).isLineSegments) {
          savedFrustum.push({ obj, fc: obj.frustumCulled });
          obj.frustumCulled = false;
        }
      });

      this.updateAtmosphereForRoom('G1_SANATORIUM');
      this.camera.position.set(0, 1.8, 6.4);
      this.camera.lookAt(0, 2.2, -5.0);
      this.world.updateWorld(0.016, 0, { x: 0, y: 0, z: 6.4 }, 'G1', false, true, false, false, false, false, null, false);
      this.composer.render();

      for (const item of savedFrustum) {
        item.obj.frustumCulled = item.fc;
      }
      this.scene.remove(dummyVial);
      this.cantor.meshGroup.visible = prevCantorVis;
      this.lux.viewModel.visible = prevLuxVis;
      restoreWorldVis();

      // Re-apply G1 culling and render clean initial Title frame
      this.positionTitleBackdropCamera();
      this.world.updateWorld(0.016, 0, this.camera.position, 'G1', false, true, false, false, false, false, null, false);
      this.composer.render();
      this.frameTimesMs.length = 0;
    } catch {
      // Safe fallback if WebGL context restricts synchronous warmup
    }
  }

  private inspectWebGLCapabilities(): void {
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      this.vendorUnmasked = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || 'Hardware Vendor');
      this.rendererUnmasked = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'WebGL2 GPU');
    } else {
      this.rendererUnmasked = String(gl.getParameter(gl.VERSION) || 'WebGL2');
    }
  }

  private setMode(next: GameMode, puzzleCtx?: { puzzleId: PuzzleId; subStation?: string }, loreId?: string): void {
    if (this.mode === 'examine' && next !== 'examine') {
      this.examiner.disposeCurrentItemResources();
    }
    if (this.mode === 'lore_modal' && next !== 'lore_modal') {
      this.audio.stopVoiceReelLog();
    }
    this.mode = next;
    this.activePuzzleContext = puzzleCtx;
    this.activeLoreModalId = loreId;

    if (next === 'title' || next === 'dead' || next === 'credits') {
      this.audio.resetPhysiologyImmediate();
      this.activeLadderClimb = null;
    }
    if (next !== 'playing') {
      this.clearMovementInputs();
      this.exitPointerLockSafe();
    }

    const curRoom = this.player.resolveCurrentRoom();
    this.ui.setPlayerMapContext(this.player.pos, this.player.yaw, this.player.resolveFloor(), curRoom.id);
    this.ui.renderMode(next, this.saveSys.hasAnySave(), puzzleCtx, loreId, {
      activeSeconds: this.activeSimulationSeconds,
      wallClockSeconds: this.sessionWallClockSeconds,
      distanceMeters: this.player.distanceWalked,
    });
  }

  private startNewGame(): void {
    this.audio.unlock();
    this.audio.stopVoiceReelLog();
    this.audio.resetPhysiologyImmediate();
    this.activeSimulationSeconds = 0;
    this.sessionWallClockSeconds = 0;
    this.safeHavenStabilizeAccum = 0;
    this.elevatorInTransitTo = null;
    this.activeLadderClimb = null;

    this.player = new PlayerController();
    this.player.pos = { x: 0, y: 0, z: 13.4 };
    this.player.yaw = 0;
    this.player.pitch = -0.04;
    this.player.health = 2;

    this.stateSys.inventory = {};
    this.stateSys.collectedLore.clear();
    this.stateSys.flags.clear();
    this.stateSys.shortcutsUnlocked.clear();
    this.stateSys.puzzles = createInitialPuzzleState();
    this.autoCheckpointsHit.clear();
    this.examiner.disposeCurrentItemResources();

    this.lux.acquired = false;
    this.lux.mode = 0;
    this.lux.charge = 90;
    this.lux.calibrated = false;

    this.cantor.deactivate();

    for (const d of this.world.doors.values()) {
      d.isOpen = Boolean(d.def.initialOpen);
      d.openProgress = d.isOpen ? 1 : 0;
      d.isUnlocked = !d.def.lockedBy;
    }
    for (const rt of this.world.interactables.values()) {
      rt.collected = false;
      rt.mesh.visible = true;
    }

    this.currentElevatorFloor = 'G1';
    this.world.elevatorY = 0;
    this.world.elevatorTargetY = 0;
    this.player.syncElevatorAttachment(0);
    this.syncElevatorShaftGuards();

    this.setMode('playing');
    this.saveCheckpoint('Auto-CP 0: Storm Portico Arrival', false);
    this.ui.showToast('Pneumatic storm shutter sealed on sub-basal backup current. Inspect G1 Triage Atrium.', 5.0);
  }

  private syncElevatorShaftGuards(): void {
    const setGuard = (f: 'G1' | 'B1' | 'B3', floorY: number) => {
      const cabPresent = Math.abs(this.world.elevatorY - floorY) < 0.32;
      const g = this.shaftGuardColliders[f];
      if (cabPresent) {
        g.minY = -9999;
        g.maxY = -9998;
      } else {
        g.minY = floorY;
        g.maxY = floorY + 2.7;
      }
    };
    setGuard('G1', 0.0);
    setGuard('B1', -5.5);
    setGuard('B3', -16.5);
  }

  private saveCheckpoint(label: string, manual: boolean): void {
    const snap: SaveSnapshot = {
      version: 1,
      timestamp: new Date().toISOString(),
      checkpointLabel: label,
      seed: this.seed,
      elapsedPlaySeconds: this.activeSimulationSeconds,
      distanceWalkedMeters: this.player.distanceWalked,
      playerPos: { ...this.player.pos },
      playerYaw: this.player.yaw,
      playerPitch: this.player.pitch,
      playerFloor: this.player.resolveFloor(),
      health: this.player.health,
      lampMode: this.lux.mode,
      lampCharge: this.lux.charge,
      lampCalibrated: this.lux.calibrated,
      inventory: { ...this.stateSys.inventory },
      collectedInteractables: Array.from(this.world.interactables.values())
        .filter((i) => i.collected)
        .map((i) => i.def.id),
      collectedLore: Array.from(this.stateSys.collectedLore),
      flags: Array.from(this.stateSys.flags),
      openDoors: Array.from(this.world.doors.values())
        .filter((d) => d.isOpen)
        .map((d) => d.def.id),
      unlockedDoors: Array.from(this.world.doors.values())
        .filter((d) => d.isUnlocked)
        .map((d) => d.def.id),
      shortcutsUnlocked: Array.from(this.stateSys.shortcutsUnlocked),
      elevatorFloor: this.currentElevatorFloor,
      puzzles: JSON.parse(JSON.stringify(this.stateSys.puzzles)),
      cantorActive: this.cantor.active,
      cantorTrapped: this.cantor.state === 'TRAPPED',
    };
    this.saveSys.save(snap, manual);
    if (manual) {
      this.audio.playInteraction('switch');
      this.ui.showToast(`Tape Recorder Saved: ${label}`, 3.5);
    }
  }

  private restoreSnapshot(snap: SaveSnapshot): void {
    this.audio.unlock();
    this.audio.stopVoiceReelLog();
    this.audio.resetPhysiologyImmediate();
    this.activeSimulationSeconds = snap.elapsedPlaySeconds;
    this.elevatorInTransitTo = null;
    this.activeLadderClimb = null;
    this.examiner.disposeCurrentItemResources();

    this.player.pos = { ...snap.playerPos };
    this.player.yaw = snap.playerYaw;
    this.player.pitch = snap.playerPitch;
    this.player.health = Math.max(1, snap.health);
    this.player.hiddenSpot = null;
    this.player.stamina = 100;
    this.player.distanceWalked = snap.distanceWalkedMeters;

    this.stateSys.inventory = { ...snap.inventory };
    this.stateSys.collectedLore = new Set(snap.collectedLore);
    this.stateSys.flags = new Set(snap.flags);
    this.stateSys.shortcutsUnlocked = new Set(snap.shortcutsUnlocked);
    this.stateSys.puzzles = {
      ...createInitialPuzzleState(),
      ...JSON.parse(JSON.stringify(snap.puzzles)),
    };
    if (this.stateSys.puzzles.crtSubjectQueried && !this.stateSys.puzzles.crtLastQuery) {
      this.stateSys.puzzles.crtLastQuery = '1984-11-17';
      if (!this.stateSys.puzzles.crtQueryInput) {
        this.stateSys.puzzles.crtQueryInput = '1984-11-17';
      }
    }

    this.lux.acquired = this.stateSys.hasItem('lux_meter') || this.stateSys.flags.has('acquired_lux_meter');
    this.lux.mode = snap.lampMode;
    this.lux.charge = snap.lampCharge;
    this.lux.calibrated = snap.lampCalibrated;

    const collectedSet = new Set(snap.collectedInteractables);
    for (const [id, rt] of this.world.interactables.entries()) {
      rt.collected = collectedSet.has(id);
      rt.mesh.visible = !rt.collected;
    }

    const openSet = new Set(snap.openDoors);
    const unlockedSet = new Set(snap.unlockedDoors);
    for (const [id, d] of this.world.doors.entries()) {
      d.isUnlocked = unlockedSet.has(id) || !d.def.lockedBy;
      d.isOpen = openSet.has(id);
      d.openProgress = d.isOpen ? 1 : 0;
    }

    this.currentElevatorFloor = snap.elevatorFloor;
    this.world.elevatorY = ELEVATOR_FLOORS_Y[snap.elevatorFloor];
    this.world.elevatorTargetY = this.world.elevatorY;
    this.player.syncElevatorAttachment(this.world.elevatorY);
    this.syncElevatorShaftGuards();

    if (snap.cantorTrapped) {
      this.cantor.active = true;
      this.cantor.sealInContainmentVault();
    } else if (snap.cantorActive) {
      this.cantor.spawnOnFloor(snap.playerFloor, 4);
    } else {
      this.cantor.deactivate();
    }

    this.audio.updatePhysiology(
      0.1,
      this.player.stamina,
      false,
      this.player.health,
      this.cantor.active && this.cantor.state !== 'TRAPPED',
      this.cantor.state,
      99
    );

    this.stateSys.enforceVialSupplyFloor(this.world.interactables);
    this.setMode('playing');
    this.ui.showToast(`Restored: ${snap.checkpointLabel}`);
  }

  private handlePuzzleEvent(ev: string): void {
    this.audio.playInteraction('switch');
    if (ev === 'solved_puzzle1') {
      this.lux.calibrated = true;
      this.ui.showToast('Unlocked Sub-Station Service Key & Harmonic Lamp Calibration!', 4.5);
      this.cantor.spawnOnFloor('G2', 0);
      this.saveCheckpoint('Auto-CP 2: Radiology Calibration Complete', false);
    } else if (ev === 'solved_puzzle2') {
      this.ui.showToast('60 PSI Equalized — Freight Elevator & G2↔B1 Dumbwaiter Energized!', 4.5);
      this.cantor.spawnOnFloor('G1', 1);
      this.saveCheckpoint('Auto-CP 2B: Hydrotherapy Bus Restored', false);
    } else if (ev === 'wrong_cryo_drawer_noise') {
      this.ui.showToast('Frozen mortuary latch shrieked — acoustic alert in B1!', 3.5, true);
      this.cantor.emitAcousticStimulus({ ...this.player.pos }, 24, 'frozen_drawer_shriek', true);
    } else if (ev === 'solved_puzzle3') {
      this.ui.showToast('G2↔B1 Dumbwaiter Cleared — Retrieved Calibrated 30A Silver Fuse Element!', 4.0);
    } else if (ev === 'solved_puzzle4') {
      const blastHatch = this.world.doors.get('D20');
      if (blastHatch) {
        blastHatch.isUnlocked = true;
        blastHatch.isOpen = true;
      }
      this.audio.playInteraction('lure_horn', { x: 0, y: -6.2, z: -27.8 });
      this.cantor.spawnOnFloor('B2', 0);
      this.cantor.emitAcousticStimulus({ x: -1.0, y: -11.0, z: -20.0 }, 26, 'oscillator_108hz_chime', true);
      this.saveCheckpoint('Auto-CP 4: B2 Oscillator Resonance Locked', false);
      this.ui.showToast('108 Hz Phase Lock! B3 Blast Hatch unbolted — Subject 09 alerted in B2!', 5.0, true);
    } else if (ev === 'substation_overload_trip') {
      this.ui.showToast('Phase exceeded 50 kW — breaker tripped safely! Balance at 40 / 40 / 40 kW.', 4.0, true);
      this.cantor.emitAcousticStimulus({ ...this.player.pos }, 18, 'breaker_overload_trip', false);
    } else if (ev === 'solved_puzzle5a') {
      if (!this.cantor.active || this.cantor.floor !== 'B3') {
        this.cantor.spawnOnFloor('B3', 0);
      }
      const d21 = this.world.doors.get('D21');
      const d22 = this.world.doors.get('D22');
      if (d21) d21.isOpen = true;
      if (d22) d22.isOpen = true;
      this.saveCheckpoint('Auto-CP 5: B3 Substation 120 kW Transfer Active', false);
      this.ui.showToast('120 kW Transfer Live! Sequence the two Acoustic Lures in B3 Containment Gallery!', 5.5);
    }
  }

  // R5-SPATIAL-01: Initiates continuous physical climb along the Shortcut 3 steel ladder through the carved B2<->B1 hatch shaft
  private beginShortcut3LadderClimb(direction: 'up' | 'down', worldPos: Vec3): void {
    this.stateSys.shortcutsUnlocked.add(3);
    this.player.hiddenSpot = null;
    this.audio.playInteraction('door_open', worldPos);

    if (direction === 'up') {
      this.activeLadderClimb = {
        direction: 'up',
        elapsed: 0,
        duration: 1.35,
        startPos: { ...this.player.pos },
        shaftEntryPos: { x: 8.4, y: -10.8, z: -14.55 },
        shaftExitPos: { x: 8.4, y: -5.5, z: -14.55 },
        endPos: { x: 8.4, y: -5.5, z: -13.15 },
        endYaw: Math.PI,
        lastRungStep: 0,
      };
      this.ui.showToast('Maintenance Hatch Unbolted — Climbing Ladder to B1 Corridor...');
    } else {
      this.activeLadderClimb = {
        direction: 'down',
        elapsed: 0,
        duration: 1.35,
        startPos: { ...this.player.pos },
        shaftEntryPos: { x: 8.4, y: -5.5, z: -14.55 },
        shaftExitPos: { x: 8.4, y: -10.85, z: -14.55 },
        endPos: { x: 8.4, y: -11.0, z: -15.95 },
        endYaw: 0,
        lastRungStep: 0,
      };
      this.ui.showToast('Descending Maintenance Ladder to B2 Dispatch Airlock...');
    }
  }

  private updateLadderClimb(dt: number): void {
    const cl = this.activeLadderClimb;
    if (!cl) return;

    const prevPos = { ...this.player.pos };
    cl.elapsed = Math.min(cl.duration, cl.elapsed + dt);
    const t = cl.elapsed / cl.duration;

    const lerpVec = (a: Vec3, b: Vec3, u: number): Vec3 => ({
      x: THREE.MathUtils.lerp(a.x, b.x, u),
      y: THREE.MathUtils.lerp(a.y, b.y, u),
      z: THREE.MathUtils.lerp(a.z, b.z, u),
    });

    if (t < 0.18) {
      const u = t / 0.18;
      this.player.pos = lerpVec(cl.startPos, cl.shaftEntryPos, u);
      this.player.pitch = THREE.MathUtils.lerp(this.player.pitch, cl.direction === 'up' ? 0.36 : -0.42, u);
    } else if (t < 0.82) {
      const u = (t - 0.18) / 0.64;
      const smoothU = u * u * (3 - 2 * u);
      this.player.pos = lerpVec(cl.shaftEntryPos, cl.shaftExitPos, smoothU);
      this.player.yaw = Math.PI; // Facing south ladder rungs at z = -14.14
      this.player.pitch = cl.direction === 'up' ? 0.34 : -0.34;
      const rungIdx = Math.floor(u * 4) + 1;
      if (rungIdx > cl.lastRungStep) {
        cl.lastRungStep = rungIdx;
        this.audio.playFootstep('grate');
      }
    } else {
      const u = (t - 0.82) / 0.18;
      this.player.pos = lerpVec(cl.shaftExitPos, cl.endPos, u);
      this.player.yaw = cl.endYaw;
      this.player.pitch = THREE.MathUtils.lerp(cl.direction === 'up' ? 0.2 : -0.2, -0.04, u);
    }

    const moved = Math.hypot(
      this.player.pos.x - prevPos.x,
      this.player.pos.y - prevPos.y,
      this.player.pos.z - prevPos.z
    );
    this.player.distanceWalked += moved;
    this.player.vel = { x: 0, y: 0, z: 0 };

    this.camera.position.set(this.player.pos.x, this.player.pos.y + 1.52, this.player.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.player.yaw;
    this.camera.rotation.x = this.player.pitch;
    this.camera.rotation.z = 0;

    if (cl.elapsed >= cl.duration) {
      this.player.pos = { ...cl.endPos };
      this.player.yaw = cl.endYaw;
      this.player.pitch = -0.04;
      this.activeLadderClimb = null;
    }
  }

  private performPrimaryInteract(): void {
    if (this.activeLadderClimb) return;

    if (this.player.hiddenSpot) {
      this.player.exitHiding();
      this.audio.playInteraction('door_open');
      return;
    }
    if (!this.hoveredTarget) return;

    const { type, id } = this.hoveredTarget;
    if (type === 'hiding') {
      const spot = this.world.hidingSpots.get(id);
      if (spot) {
        this.cantor.notifyPlayerEnteredHiding(this.player.pos, this.world.staticColliders);
        this.player.enterHiding(spot);
        this.audio.playInteraction('door_open');
      }
      return;
    }

    if (type === 'door') {
      const door = this.world.doors.get(id);
      if (!door) return;
      this.tryToggleDoor(door.def.id);
      return;
    }

    const rt = this.world.interactables.get(id);
    if (!rt || rt.collected) return;
    const def = rt.def;
    rt.mesh.getWorldPosition(this.tmpWorldPos);
    const worldPos: Vec3 = { x: this.tmpWorldPos.x, y: this.tmpWorldPos.y, z: this.tmpWorldPos.z };

    switch (def.kind) {
      case 'pickup_item': {
        if (def.itemId) {
          this.stateSys.addItem(def.itemId, 1);
          if (def.itemId === 'lux_meter') {
            this.lux.acquired = true;
            this.lux.mode = 1;
          }
          rt.collected = true;
          rt.mesh.visible = false;
          if (def.setsFlag) this.stateSys.flags.add(def.setsFlag);
          this.audio.playInteraction('pickup');
          this.ui.showToast(`Acquired: ${ITEMS[def.itemId]?.name ?? def.itemId}`);
        }
        break;
      }
      case 'lore_doc':
      case 'audio_reel': {
        if (def.loreId) {
          this.stateSys.collectedLore.add(def.loreId);
          if (def.setsFlag) this.stateSys.flags.add(def.setsFlag);
          if (def.kind === 'audio_reel') {
            this.audio.playVoiceReelLog(def.loreId);
          } else {
            this.audio.playInteraction('pickup');
          }
          this.setMode('lore_modal', undefined, def.loreId);
        }
        break;
      }
      case 'puzzle_station': {
        if (def.puzzleId) {
          this.setMode('puzzle', { puzzleId: def.puzzleId, subStation: def.id });
        }
        break;
      }
      case 'save_recorder': {
        const room = this.player.resolveCurrentRoom();
        if (this.player.health === 1 && this.stateSys.getItemCount('gauze_injector') === 0) {
          this.player.health = 2;
          this.audio.playInteraction('heal');
          this.saveCheckpoint(`Manual Save & Stabilized — ${room.name}`, true);
          this.ui.showToast(`Station First-Aid Stabilized Wounds & Saved: ${room.name}`, 4.5);
        } else {
          this.saveCheckpoint(`Manual Save — ${room.name}`, true);
        }
        break;
      }
      case 'conduit_junction': {
        if (!this.lux.acquired) {
          this.ui.showToast('Dark recessed tile seam — retrieve the Triage Lux-Meter first.');
        } else {
          this.stateSys.puzzles.conduitBoxOpened = true;
          if (def.setsFlag) this.stateSys.flags.add(def.setsFlag);
          this.audio.playInteraction('switch', worldPos);
          this.ui.showToast('Lux-Meter needle spiked to 94%! Concealed yellow 13.8 kV feeder traced to Boiler Door.');
        }
        break;
      }
      case 'elevator_call': {
        if (!this.stateSys.puzzles.freightBusEngaged) {
          this.audio.playInteraction('door_locked', worldPos);
          this.ui.showToast('Freight Elevator unpowered — equalize Hydrotherapy Steam (60 PSI) & engage Bus Switch.');
          return;
        }
        const target = def.elevatorTarget ?? 'G1';
        this.world.elevatorTargetY = ELEVATOR_FLOORS_Y[target];
        this.currentElevatorFloor = target;
        this.audio.playInteraction('switch', worldPos);
        this.ui.showToast(`Summoning Freight Cage to Level ${target}...`);
        break;
      }
      case 'elevator_panel': {
        if (!this.stateSys.puzzles.freightBusEngaged) {
          this.ui.showToast('Auxiliary lift bus offline.');
          return;
        }
        this.mode = 'puzzle';
        this.clearMovementInputs();
        this.exitPointerLockSafe();
        this.ui.renderElevatorSelectorModal(this.currentElevatorFloor, this.stateSys.shortcutsUnlocked.has(5));
        break;
      }
      case 'shortcut_latch': {
        if (def.id === 'int_shortcut3_hatch' || def.id === 'int_shortcut3_top') {
          if (def.id === 'int_shortcut3_top' && !this.stateSys.shortcutsUnlocked.has(3)) {
            this.audio.playInteraction('door_locked', worldPos);
            this.ui.showToast('Pneumatically bolted from below in B2 Dispatch Airlock.');
            return;
          }
          this.beginShortcut3LadderClimb(def.id === 'int_shortcut3_hatch' ? 'up' : 'down', worldPos);
        } else if (def.id === 'int_shortcut5_override') {
          this.stateSys.shortcutsUnlocked.add(5);
          this.audio.playInteraction('switch', worldPos);
          this.ui.showToast('Freight Elevator Call Override engaged — Cage now links B3 ↔ B1 ↔ G1!');
        }
        break;
      }
      case 'pneumatic_buzzer': {
        this.audio.playInteraction('lure_horn', worldPos);
        this.cantor.emitAcousticStimulus(worldPos, 26, 'pneumatic_wall_buzzer', true);
        this.ui.showToast('Pneumatic call buzzer sounding — drawing Subject 09 toward decoy!');
        break;
      }
      case 'supply_drawer': {
        if (def.id === 'int_vial_dispenser_b2') {
          const have = this.stateSys.getItemCount('glass_vial');
          if (have < 2) {
            this.stateSys.addItem('glass_vial', 2 - have);
            this.audio.playInteraction('pickup');
            this.ui.showToast('Replenished Empty Glass Specimen Vials (Minimum Supply = 2).');
          } else {
            this.ui.showToast('Satchel already holds 2+ Specimen Vials.');
          }
        } else if (def.id === 'int_portico_shutter') {
          this.ui.showToast('Pneumatic fire-shutter locked by 120 kW sub-basal containment bus.');
        } else {
          this.stateSys.addItem('glass_vial', 1);
          rt.collected = true;
          rt.mesh.visible = false;
          this.audio.playInteraction('pickup');
          this.ui.showToast('Recovered Empty Glass Specimen Vial from drawer.');
        }
        break;
      }
      case 'climax_lure': {
        if (!this.stateSys.puzzles.substationSolved) {
          this.ui.showToast('Pneumatic lure unpressurized — balance the B3 120 kW Substation first.');
          return;
        }
        if (!this.cantor.active || this.cantor.floor !== 'B3') {
          this.cantor.spawnOnFloor('B3', 1);
        }
        const d21 = this.world.doors.get('D21');
        const d22 = this.world.doors.get('D22');
        if (d21) d21.isOpen = true;
        if (d22) d22.isOpen = true;

        if (def.lureIndex === 1) {
          this.stateSys.puzzles.lure1Triggered = true;
          const lure1Target: Vec3 = { x: 0.0, y: -16.5, z: -28.8 };
          this.audio.playInteraction('lure_horn', lure1Target);
          this.cantor.emitAcousticStimulus(lure1Target, 48, 'climax_lure_1_approach', true);
          this.ui.showToast(
            'West Approach Lure Resonating! Wait as Subject 09 enters the Gallery, then trigger the Inner Vault Cell Lure!',
            5.0
          );
        } else {
          if (!this.stateSys.puzzles.lure1Triggered) {
            this.audio.playInteraction('door_locked', worldPos);
            this.ui.showToast('Subject 09 is too far up-hall — trigger the West Gallery Approach Lure (#1) first!');
            return;
          }
          const distToGallery = Math.hypot(this.cantor.pos.x - 0, this.cantor.pos.z - -28.8);
          if (distToGallery > 9.5) {
            this.audio.playInteraction('lure_horn', { x: 0, y: -16.5, z: -28.8 });
            this.cantor.emitAcousticStimulus({ x: 0, y: -16.5, z: -28.8 }, 48, 'climax_lure_1_repeat', true);
            this.ui.showToast('Subject 09 is still navigating toward the Gallery bulkhead — hold until he nears the doorway!');
            return;
          }
          this.stateSys.puzzles.lure2Triggered = true;
          const vaultCellTarget: Vec3 = { x: 0.0, y: -16.5, z: -34.2 };
          this.audio.playInteraction('lure_horn', vaultCellTarget);
          this.cantor.emitAcousticStimulus(vaultCellTarget, 24, 'climax_lure_2_vault', true);
          this.ui.showToast(
            'Inner Vault Horn Sounding! Watch Subject 09 cross inside the Vault Cell, then throw the Bulkhead Lever!',
            5.0
          );
        }
        break;
      }
      case 'climax_lever': {
        if (!this.stateSys.puzzles.substationSolved) {
          this.ui.showToast('Bulkhead hydraulic interlock offline until B3 Substation is balanced at 120 kW.');
          return;
        }
        if (!this.stateSys.puzzles.lure1Triggered || !this.stateSys.puzzles.lure2Triggered) {
          this.ui.showToast('Sequence both Pneumatic Lures (West Approach → Inner Vault Cell) to draw Subject 09 inside!');
          return;
        }
        if (!this.cantor.isInsideContainmentVault()) {
          this.ui.showToast('Vault sensor reads CLEAR — wait until Subject 09 physically steps past the vault threshold!');
          return;
        }
        this.stateSys.puzzles.cantorContained = true;
        this.stateSys.flags.add('culvert_unsealed');
        this.cantor.sealInContainmentVault();
        const culvertGate = this.world.doors.get('D23');
        if (culvertGate) {
          culvertGate.isUnlocked = true;
          culvertGate.isOpen = true;
        }
        this.audio.playInteraction('door_bash', { x: 0, y: -15.0, z: -31.5 });
        this.ui.showToast('CONTAINMENT BULKHEAD SEALED! Storm-Drain Culvert Floodgate unbolted to the West!', 5.5);
        break;
      }
      case 'condemnation_switch': {
        this.stateSys.flags.add('riser_disconnected');
        this.audio.playInteraction('switch', worldPos);
        this.ui.showToast(
          'Exterior 13.8 kV Riser Disconnected — Sign the Final Disconnect Certificate beside the courtyard bench.',
          5.0
        );
        break;
      }
      case 'exit_gate': {
        if (!this.stateSys.puzzles.cantorContained) {
          this.ui.showToast('Complete the Sub-Basal Containment Protocol before departing.');
          return;
        }
        if (!this.stateSys.flags.has('riser_disconnected')) {
          this.ui.showToast('Throw the Exterior 13.8 kV Riser Disconnect Switch in the courtyard before departing.');
          return;
        }
        if (!this.stateSys.flags.has('signed_final_certificate')) {
          this.ui.showToast('Sign the Final Utility Disconnect & Acoustic Seal Certificate on the courtyard bench first.');
          return;
        }
        this.audio.playInteraction('door_open', worldPos);
        this.setMode('credits');
        break;
      }
    }
  }

  private tryToggleDoor(doorId: string): void {
    const door = this.world.doors.get(doorId);
    if (!door) return;
    const doorPos: Vec3 = { x: door.def.x, y: door.def.y + 1.2, z: door.def.z };

    if (!door.isUnlocked && door.def.lockedBy) {
      const lb = door.def.lockedBy;
      if (lb.type === 'item' && lb.keyId && this.stateSys.hasItem(lb.keyId)) {
        door.isUnlocked = true;
        door.isOpen = true;
        this.audio.playInteraction('door_open', doorPos);
        this.ui.showToast(`Unlocked ${door.def.label} with ${ITEMS[lb.keyId]?.name}.`);
        return;
      }
      if (lb.type === 'shortcut_from_side' && lb.shortcutIndex) {
        const coord = door.def.axis === 'x' ? this.player.pos.z - door.def.z : this.player.pos.x - door.def.x;
        const onUnlockSide = lb.unlockSide === 'pos' ? coord > 0 : coord < 0;
        if (onUnlockSide) {
          door.isUnlocked = true;
          door.isOpen = true;
          this.stateSys.shortcutsUnlocked.add(lb.shortcutIndex);
          this.audio.playInteraction('door_open', doorPos);
          this.ui.showToast(`Unbolted ${door.def.label}!`);
          return;
        }
      }
      if (lb.type === 'flag' && lb.flag && this.stateSys.flags.has(lb.flag)) {
        door.isUnlocked = true;
        door.isOpen = true;
        this.audio.playInteraction('door_open', doorPos);
        return;
      }
      if (door.def.isEmergencyRelease && this.player.pos.x > door.def.x) {
        door.isUnlocked = true;
        door.isOpen = true;
        this.audio.playInteraction('door_open', doorPos);
        this.ui.showToast('Opened via interior emergency release bar.');
        return;
      }

      this.audio.playInteraction('door_locked', doorPos);
      this.ui.showToast(lb.hintText);
      return;
    }

    door.isOpen = !door.isOpen;
    this.audio.playInteraction('door_open', doorPos);
    if (!door.isOpen) {
      this.cantor.emitAcousticStimulus(doorPos, 8.5, 'door_close', false);
    }
  }

  private travelElevatorTo(targetFloor: FloorId): void {
    const destY = ELEVATOR_FLOORS_Y[targetFloor];
    this.currentElevatorFloor = targetFloor;
    this.world.elevatorTargetY = destY;
    this.elevatorInTransitTo = targetFloor;

    if (
      this.player.pos.x >= 28.1 &&
      this.player.pos.x <= 31.55 &&
      Math.abs(this.player.pos.y - this.world.elevatorY) < 0.65
    ) {
      this.player.pos.x = Math.max(28.9, Math.min(31.0, this.player.pos.x));
      this.player.pos.z = Math.max(-5.0, Math.min(-3.0, this.player.pos.z));
      this.player.pos.y = this.world.elevatorY;
    }
    this.player.syncElevatorAttachment(this.world.elevatorY);
    this.audio.playInteraction('switch', { x: 30.0, y: this.world.elevatorY + 1.3, z: -4.0 });
    this.setMode('playing');
    this.ui.showToast(`Freight Cage moving toward Level ${targetFloor}...`);
  }

  private useConsumableQuick(itemId: string): void {
    if (itemId === 'capacitor_cell') {
      if (this.stateSys.getItemCount('capacitor_cell') > 0 && this.lux.useCapacitorCell()) {
        this.stateSys.consumeItem('capacitor_cell');
        this.audio.playInteraction('pickup');
        this.ui.showToast('Silver-Zinc Capacitor Cell fitted — silent 100% charge.');
      } else {
        this.ui.showToast('No Capacitor Cell needed or none carried.');
      }
    } else if (itemId === 'gauze_injector') {
      if (this.player.health < 2 && this.stateSys.consumeItem('gauze_injector')) {
        this.player.health = 2;
        this.audio.playInteraction('heal');
        this.ui.showToast('Gauze & Syrette applied — full mobility restored.');
      } else {
        this.ui.showToast(this.player.health >= 2 ? 'Uninjured — saving Gauze Syrette.' : 'No Gauze Syrette in satchel.');
      }
    }
  }

  private throwDistractionVial(): void {
    if (!this.stateSys.consumeItem('glass_vial')) {
      this.ui.showToast('No Empty Glass Specimen Vials carried [Check lab trays].');
      return;
    }
    const mesh = new THREE.Mesh(this.sharedVialGeo, this.mats.getMaterial('frosted_glass'));
    const fx = -Math.sin(this.player.yaw) * Math.cos(this.player.pitch);
    const fy = Math.sin(this.player.pitch) + 0.22;
    const fz = -Math.cos(this.player.yaw) * Math.cos(this.player.pitch);

    const start: Vec3 = {
      x: this.camera.position.x + fx * 0.5,
      y: this.camera.position.y - 0.1,
      z: this.camera.position.z + fz * 0.5,
    };
    mesh.position.set(start.x, start.y, start.z);
    this.scene.add(mesh);

    this.thrownVials.push({
      mesh,
      pos: start,
      vel: { x: fx * 10.5, y: fy * 7.5, z: fz * 10.5 },
      age: 0,
    });
  }

  private updateThrownVials(dt: number): void {
    for (let i = this.thrownVials.length - 1; i >= 0; i--) {
      const v = this.thrownVials[i];
      v.age += dt;
      v.vel.y -= 16.5 * dt;
      v.pos.x += v.vel.x * dt;
      v.pos.y += v.vel.y * dt;
      v.pos.z += v.vel.z * dt;
      v.mesh.position.set(v.pos.x, v.pos.y, v.pos.z);
      v.mesh.rotation.x += dt * 12;

      let hit = v.age > 1.8;
      for (const c of this.world.staticColliders) {
        if (
          v.pos.x >= c.minX &&
          v.pos.x <= c.maxX &&
          v.pos.y >= c.minY &&
          v.pos.y <= c.maxY &&
          v.pos.z >= c.minZ &&
          v.pos.z <= c.maxZ
        ) {
          hit = true;
          break;
        }
      }

      if (hit) {
        this.scene.remove(v.mesh);
        this.thrownVials.splice(i, 1);
        this.audio.playInteraction('vial_shatter', { ...v.pos });
        this.cantor.emitAcousticStimulus({ ...v.pos }, 24, 'shattered_vial_decoy', true);
        this.stateSys.enforceVialSupplyFloor(this.world.interactables);
      }
    }
  }

  private updateRaycastHover(): void {
    if (this.activeLadderClimb) {
      this.hoveredTarget = null;
      return;
    }

    if (this.player.hiddenSpot) {
      this.hoveredTarget = { type: 'hiding', id: this.player.hiddenSpot.id, label: '[F] Exit Hiding Spot' };
      return;
    }

    const camPos = this.camera.position;
    const dir = this.tmpHoverDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    let bestDist = 2.75;
    let best: { type: 'door' | 'interactable' | 'hiding'; id: string; label: string } | null = null;

    const rayBlocked = (tx: number, ty: number, tz: number, ignoreDoorId?: string): boolean => {
      for (const c of this.world.staticColliders) {
        if (!c.blocksLOS) continue;
        if (ignoreDoorId && c.doorId === ignoreDoorId) continue;
        if (this.segmentHitsBox(camPos.x, camPos.y, camPos.z, tx, ty, tz, c)) {
          return true;
        }
      }
      return false;
    };

    const scoreCandidate = (
      tx: number,
      ty: number,
      tz: number,
      radius: number,
      ignoreDoorId?: string
    ): number | null => {
      const vx = tx - camPos.x;
      const vy = ty - camPos.y;
      const vz = tz - camPos.z;
      const dist = Math.hypot(vx, vy, vz);
      if (dist > bestDist) return null;
      const dot = (vx * dir.x + vy * dir.y + vz * dir.z) / (dist || 1);
      if (dot < (dist < 1.25 ? 0.55 : 0.84)) return null;
      const perpSq = Math.max(0, dist * dist - Math.pow(vx * dir.x + vy * dir.y + vz * dir.z, 2));
      if (perpSq > radius * radius && dist > 1.35) return null;
      if (rayBlocked(tx, ty, tz, ignoreDoorId)) return null;
      return dist;
    };

    for (const [id, rt] of this.world.interactables.entries()) {
      if (rt.collected) continue;
      rt.mesh.getWorldPosition(this.tmpWorldPos);
      const d = scoreCandidate(this.tmpWorldPos.x, this.tmpWorldPos.y + 0.12, this.tmpWorldPos.z, 0.54);
      if (d !== null) {
        bestDist = d;
        best = { type: 'interactable', id, label: `[F] ${rt.def.label}` };
      }
    }

    for (const [id, door] of this.world.doors.entries()) {
      const d = scoreCandidate(door.def.x, door.def.y + 1.2, door.def.z, 0.95, id);
      if (d !== null) {
        bestDist = d;
        const action = door.isOpen ? 'Close' : door.isUnlocked ? 'Open' : 'Inspect / Unlock';
        best = { type: 'door', id, label: `[F] ${action} ${door.def.label}` };
      }
    }

    for (const [id, hs] of this.world.hidingSpots.entries()) {
      const d = scoreCandidate(hs.pos.x, hs.pos.y + 1.0, hs.pos.z, 0.72);
      if (d !== null) {
        bestDist = d;
        best = { type: 'hiding', id, label: `[F] ${hs.label}` };
      }
    }

    this.hoveredTarget = best;
  }

  private segmentHitsBox(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    box: AABB
  ): boolean {
    let tmin = 0.02;
    let tmax = 0.94;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const axes: Array<[number, number, number, number]> = [
      [x0, dx, box.minX, box.maxX],
      [y0, dy, box.minY, box.maxY],
      [z0, dz, box.minZ, box.maxZ],
    ];
    for (const [orig, d, minB, maxB] of axes) {
      if (Math.abs(d) < 1e-6) {
        if (orig < minB || orig > maxB) return false;
      } else {
        let t1 = (minB - orig) / d;
        let t2 = (maxB - orig) / d;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return false;
      }
    }
    return tmin <= tmax;
  }

  private updateAtmosphereForRoom(roomZone: string): void {
    const fog = this.scene.fog as THREE.FogExp2;
    const bg = this.scene.background as THREE.Color;
    switch (roomZone) {
      case 'G1_SANATORIUM':
        bg.setHex(0x132026);
        fog.color.setHex(0x15252c);
        fog.density = 0.024;
        this.hemiLight.intensity = 0.95;
        break;
      case 'G2_SURGICAL':
        bg.setHex(0x161a1c);
        fog.color.setHex(0x1a2022);
        fog.density = 0.022;
        this.hemiLight.intensity = 0.92;
        break;
      case 'B1_ARCHIVE':
        bg.setHex(0x17130d);
        fog.color.setHex(0x1d170f);
        fog.density = 0.026;
        this.hemiLight.intensity = 0.86;
        break;
      case 'B2_ANECHOIC':
        bg.setHex(0x101c22);
        fog.color.setHex(0x132229);
        fog.density = 0.024;
        this.hemiLight.intensity = 0.9;
        break;
      case 'B3_SUBSTATION':
        bg.setHex(0x121e24);
        fog.color.setHex(0x15242b);
        fog.density = 0.025;
        this.hemiLight.intensity = 0.92;
        break;
      case 'COURTYARD_DAWN':
        bg.setHex(0x6b8496);
        fog.color.setHex(0x6d8699);
        fog.density = 0.02;
        this.hemiLight.intensity = 1.4;
        break;
    }
  }

  private positionTitleBackdropCamera(): void {
    this.camera.position.set(-4.2, 2.35, 6.4);
    this.camera.lookAt(0.5, 3.6, -5.5);
  }

  private bindInputListeners(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.bloomPass.resolution.set(
        Math.max(1, Math.floor(window.innerWidth * 0.5)),
        Math.max(1, Math.floor(window.innerHeight * 0.5))
      );
    });

    // R5-INPUT-01 & R7-INPUT-01: Track genuine pointer lock in 'playing' so native Escape pauses immediately,
    // and reject/release any delayed pointer-lock grant that arrives after transitioning out of 'playing'.
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.canvas) {
        if (this.mode !== 'playing') {
          this.hadPointerLock = false;
          this.exitPointerLockSafe();
          return;
        }
        this.hadPointerLock = true;
        this.programmaticPointerUnlock = false;
      } else {
        const wasLocked = this.hadPointerLock;
        const wasProgrammatic = this.programmaticPointerUnlock;
        this.hadPointerLock = false;
        this.programmaticPointerUnlock = false;
        if (wasLocked && !wasProgrammatic && this.mode === 'playing') {
          this.qaAudit.inputEventsProcessed++;
          this.clearMovementInputs();
          this.lastPointerUnlockPauseAt = performance.now();
          this.setMode('paused');
        }
      }
    });

    window.addEventListener('blur', () => {
      const wasLocked = this.hadPointerLock;
      this.clearMovementInputs();
      if (wasLocked && this.mode === 'playing') {
        this.hadPointerLock = false;
        this.programmaticPointerUnlock = false;
        this.setMode('paused');
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (this.mode === 'playing' && !this.activeLadderClimb && document.pointerLockElement === this.canvas) {
        this.qaAudit.inputEventsProcessed++;
        this.player.applyLookDelta(e.movementX, e.movementY, this.settingsMgr.get());
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.audio.unlock();
      if (this.mode !== 'playing') return;
      this.qaAudit.inputEventsProcessed++;
      // R7-INPUT-01: Consume unlocked canvas clicks strictly for pointer-lock acquisition without dispatching
      // interaction, lamp toggle, or vial throw on the capture gesture.
      if (document.pointerLockElement !== this.canvas) {
        try {
          this.programmaticPointerUnlock = false;
          const maybePromise = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
          if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch(() => {});
          }
        } catch {
          // Safe fallback
        }
        return;
      }
      if (e.button === 0) {
        this.performPrimaryInteract();
      } else if (e.button === 2) {
        this.lux.cycleMode();
        this.audio.playInteraction('switch');
      } else if (e.button === 1) {
        this.throwDistractionVial();
      }
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.mode === 'playing') e.preventDefault();
    });

    window.addEventListener('keydown', (e) => {
      this.audio.unlock();
      if ((e.target as HTMLElement)?.tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'text') {
        if (e.code === 'Escape') this.setMode('playing');
        return;
      }

      this.qaAudit.inputEventsProcessed++;

      if (e.code === 'Escape') {
        e.preventDefault();
        // Guard against duplicate pause->resume if both pointerlockchange and keydown fire on the same physical press
        if (this.mode === 'paused' && performance.now() - this.lastPointerUnlockPauseAt < 120) {
          return;
        }
        if (this.mode === 'playing') {
          this.setMode('paused');
        } else if (
          this.mode === 'paused' ||
          this.mode === 'inventory' ||
          this.mode === 'puzzle' ||
          this.mode === 'lore_modal'
        ) {
          this.setMode('playing');
        } else if (this.mode === 'examine') {
          this.setMode('inventory');
        } else if (this.mode === 'settings') {
          const ret = this.ui.getReturnModeFromSettings();
          this.setMode(ret);
        }
        return;
      }

      if (e.code === 'Tab' || e.code === 'KeyI' || e.code === 'KeyM') {
        if (this.mode === 'playing') {
          e.preventDefault();
          const tab = e.code === 'KeyM' ? 'map' : 'inventory';
          this.ui.setBinderTab(tab, this.player.resolveFloor());
          this.setMode('inventory');
          return;
        } else if (this.mode === 'inventory') {
          e.preventDefault();
          this.setMode('playing');
          return;
        }
      }

      if (this.mode !== 'playing') return;

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.input.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.input.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.input.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.input.right = true;
          break;
        case 'BracketLeft':
          this.keyTurnLeft = true;
          break;
        case 'BracketRight':
          this.keyTurnRight = true;
          break;
        case 'PageUp':
        case 'Equal':
          this.keyPitchUp = true;
          break;
        case 'PageDown':
        case 'Minus':
          this.keyPitchDown = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.input.sprint = true;
          break;
        case 'KeyC':
          if (!e.repeat) this.player.toggleCrouch();
          break;
        case 'ControlLeft':
        case 'ControlRight':
          this.input.crouchHeld = true;
          break;
        case 'KeyQ':
          this.input.leanLeft = true;
          break;
        case 'KeyE':
          this.input.leanRight = true;
          break;
        case 'KeyF':
          if (!e.repeat) this.performPrimaryInteract();
          break;
        case 'KeyL':
          if (!e.repeat) {
            this.lux.cycleMode();
            this.audio.playInteraction('switch');
          }
          break;
        case 'KeyR':
          this.crankHeld = true;
          break;
        case 'KeyG':
          if (!e.repeat) this.useConsumableQuick('capacitor_cell');
          break;
        case 'KeyH':
          if (!e.repeat) this.useConsumableQuick('gauze_injector');
          break;
        case 'KeyV':
          if (!e.repeat) this.throwDistractionVial();
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.input.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.input.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.input.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.input.right = false;
          break;
        case 'BracketLeft':
          this.keyTurnLeft = false;
          break;
        case 'BracketRight':
          this.keyTurnRight = false;
          break;
        case 'PageUp':
        case 'Equal':
          this.keyPitchUp = false;
          break;
        case 'PageDown':
        case 'Minus':
          this.keyPitchDown = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.input.sprint = false;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          this.input.crouchHeld = false;
          break;
        case 'KeyQ':
          this.input.leanLeft = false;
          break;
        case 'KeyE':
          this.input.leanRight = false;
          break;
        case 'KeyR':
          this.crankHeld = false;
          break;
      }
    });
  }

  private clearMovementInputs(): void {
    this.input.forward = false;
    this.input.backward = false;
    this.input.left = false;
    this.input.right = false;
    this.input.sprint = false;
    this.input.crouchHeld = false;
    this.input.leanLeft = false;
    this.input.leanRight = false;
    this.keyTurnLeft = false;
    this.keyTurnRight = false;
    this.keyPitchUp = false;
    this.keyPitchDown = false;
    this.crankHeld = false;
  }

  private exitPointerLockSafe(): void {
    try {
      if (document.pointerLockElement) {
        this.programmaticPointerUnlock = true;
        document.exitPointerLock();
      }
    } catch {
      this.programmaticPointerUnlock = false;
    }
  }

  private lastFrameTs = performance.now();

  private animate(now: number): void {
    requestAnimationFrame((t) => this.animate(t));

    const rawDt = Math.max(0.001, (now - this.lastFrameTs) / 1000);
    this.lastFrameTs = now;
    const dt = Math.min(0.05, rawDt);
    this.elapsedTotal += dt;

    this.frameTimesMs.push(rawDt * 1000);
    if (this.frameTimesMs.length > 240) this.frameTimesMs.shift();

    if (
      this.mode === 'playing' ||
      this.mode === 'inventory' ||
      this.mode === 'examine' ||
      this.mode === 'puzzle' ||
      this.mode === 'lore_modal'
    ) {
      this.sessionWallClockSeconds += rawDt;
    }

    if (this.mode === 'title') {
      this.updateAtmosphereForRoom('G1_SANATORIUM');
      this.camera.position.set(
        -4.2 + Math.sin(this.elapsedTotal * 0.25) * 0.45,
        2.35 + Math.cos(this.elapsedTotal * 0.2) * 0.12,
        6.4
      );
      this.camera.lookAt(0.5, 3.5, -5.5);
      this.world.updateWorld(
        dt,
        this.elapsedTotal,
        this.camera.position,
        'G1',
        false,
        this.settingsMgr.get().reduceFlashingLights,
        false,
        false,
        false,
        false,
        null,
        false
      );
      this.renderFrameWithMetrics();
      return;
    }

    const liveWorldSimulation =
      this.mode === 'playing' || this.mode === 'puzzle' || this.mode === 'lore_modal';

    if (!liveWorldSimulation) {
      this.ui.tickOverlayTimers(dt);
    }

    if (liveWorldSimulation) {
      this.activeSimulationSeconds += dt;
      const settings = this.settingsMgr.get();

      if (this.mode === 'playing' && !this.activeLadderClimb) {
        const turnDelta = ((this.keyTurnLeft ? 1 : 0) - (this.keyTurnRight ? 1 : 0)) * dt * 1.9;
        const pitchDelta = ((this.keyPitchUp ? 1 : 0) - (this.keyPitchDown ? 1 : 0)) * dt * 1.45;
        if (turnDelta !== 0 || pitchDelta !== 0) {
          this.player.applyKeyboardLook(turnDelta, pitchDelta);
        }
      }

      if (this.elevatorInTransitTo && Math.abs(this.world.elevatorY - this.world.elevatorTargetY) < 0.02) {
        const arrivedFloor = this.elevatorInTransitTo;
        this.elevatorInTransitTo = null;
        if (arrivedFloor === 'B1' && !this.autoCheckpointsHit.has('cp3_b1')) {
          this.autoCheckpointsHit.add('cp3_b1');
          this.cantor.spawnOnFloor('B1', 2);
          this.saveCheckpoint('Auto-CP 3: Level B1 Sub-Basal Arrival', false);
        }
        this.ui.showToast(`Freight Elevator arrived at Level ${arrivedFloor}.`);
      }

      this.world.updateWorld(
        dt,
        this.elapsedTotal,
        this.player.pos,
        this.player.resolveFloor(),
        this.stateSys.flags.has('act3_purge_active') && !this.stateSys.puzzles.cantorContained,
        settings.reduceFlashingLights,
        this.stateSys.puzzles.oscillatorSolved,
        this.stateSys.puzzles.steamSolved,
        this.stateSys.puzzles.cantorContained,
        settings.highContrastReticle,
        this.hoveredTarget?.type === 'interactable' ? this.hoveredTarget.id : null,
        this.stateSys.shortcutsUnlocked.has(3)
      );
      this.syncElevatorShaftGuards();

      // R5-PHYSICS-01 fix: Single authoritative elevator rider carry inside PlayerController.update()!
      let sprintingNow = false;
      if (this.activeLadderClimb) {
        this.updateLadderClimb(dt);
        this.player.syncElevatorAttachment(this.world.elevatorY);
      } else {
        const activeInput =
          this.mode === 'playing'
            ? this.input
            : {
                forward: false,
                backward: false,
                left: false,
                right: false,
                sprint: false,
                crouchHeld: false,
                leanLeft: false,
                leanRight: false,
              };

        const moveRes = this.player.update(
          dt,
          activeInput,
          this.world.staticColliders,
          this.world.elevatorY,
          settings,
          this.camera,
          (surface, loudness) => {
            this.audio.playFootstep(surface);
            if (loudness >= 9) {
              this.cantor.emitAcousticStimulus({ ...this.player.pos }, loudness, `footstep_${surface}`, false);
            }
          }
        );
        sprintingNow = moveRes.sprintingNow;
      }

      if (sprintingNow) {
        this.cantor.emitAcousticStimulus({ ...this.player.pos }, 14.5, 'sprint_footsteps', false);
      }

      const room = this.player.resolveCurrentRoom();
      const floor = this.player.resolveFloor();
      this.updateAtmosphereForRoom(room.zone);
      this.audio.setZoneAmbience(room.ambientType);

      if (room.safeHaven && this.player.health === 1) {
        this.safeHavenStabilizeAccum += dt;
        if (this.safeHavenStabilizeAccum >= 16.0) {
          this.safeHavenStabilizeAccum = 0;
          this.player.health = 2;
          this.audio.playInteraction('heal');
          this.ui.showToast('Safe Haven respite — breathing steadied and lacerations stabilized.');
        }
      } else {
        this.safeHavenStabilizeAccum = 0;
      }

      if (room.id === 'R02' && !this.autoCheckpointsHit.has('cp1_atrium')) {
        this.autoCheckpointsHit.add('cp1_atrium');
        this.saveCheckpoint('Auto-CP 1: G1 Triage Atrium', false);
      }

      if (
        !this.stateSys.flags.has('g1_stalk_glimpse_triggered') &&
        this.player.pos.y >= -0.5 &&
        this.player.pos.y <= 2.5 &&
        this.player.pos.x > 9.4 &&
        this.player.pos.z < -1.5
      ) {
        this.stateSys.flags.add('g1_stalk_glimpse_triggered');
        this.cantor.spawnOnFloor('G1', 0);
        this.audio.playInteraction('door_bash', { x: 14, y: 1.2, z: -4 });
        this.ui.showToast('Something tall in a brass thoracic rig just crossed the East Ward glass...', 4.5);
      }

      this.tmpCamForward.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
      const camFwd: Vec3 = {
        x: this.tmpCamForward.x,
        y: this.tmpCamForward.y,
        z: this.tmpCamForward.z,
      };

      this.lux.update(
        dt,
        this.elapsedTotal,
        this.mode === 'playing' && !this.activeLadderClimb && this.crankHeld,
        settings.reduceFlashingLights,
        { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
        camFwd,
        this.player.pos,
        this.cantor.active && this.cantor.state !== 'TRAPPED',
        this.cantor.pos,
        this.world.staticColliders,
        [
          { x: 20.5, y: 1.35, z: 6.8 },
          { x: -10.5, y: -10.5, z: -17.5 },
          { x: 19.5, y: -15.2, z: -12.5 },
        ],
        () => {
          this.audio.playDynamoClick();
          this.cantor.emitAcousticStimulus({ ...this.player.pos }, 17.5, 'dynamo_crank', false);
        },
        (spotHit) => {
          const offsetHit: Vec3 = {
            x: spotHit.x - camFwd.x * 0.14,
            y: spotHit.y - camFwd.y * 0.14 - 1.35,
            z: spotHit.z - camFwd.z * 0.14,
          };
          if (!this.cantor.segmentOccluded(this.cantor.pos, offsetHit, this.world.staticColliders)) {
            this.cantor.emitAcousticStimulus(
              { x: spotHit.x - camFwd.x * 0.14, y: this.cantor.pos.y, z: spotHit.z - camFwd.z * 0.14 },
              12.0,
              'tungsten_surface_glare',
              false
            );
          }
        }
      );

      this.updateThrownVials(dt);

      const cantorTick = this.cantor.update(
        dt,
        this.elapsedTotal,
        this.player.pos,
        floor,
        Boolean(room.safeHaven),
        Boolean(this.player.hiddenSpot),
        this.player.isCrouching,
        this.lux.mode,
        this.world.staticColliders,
        this.world.doors,
        (doorId) => {
          const d = this.world.doors.get(doorId);
          this.audio.playInteraction(
            'door_bash',
            d ? { x: d.def.x, y: d.def.y + 1.2, z: d.def.z } : undefined,
            true
          );
          this.player.triggerCameraShake(0.65);
        },
        () => {
          if (this.player.hiddenSpot) this.player.exitHiding();
          this.activeLadderClimb = null;
          this.player.health = Math.max(0, this.player.health - 1);
          this.player.triggerCameraShake(1.0);
          this.audio.playInteraction('hit');
          if (this.player.health <= 0) {
            this.setMode('dead');
          } else {
            if (this.mode !== 'playing') {
              this.setMode('playing');
            }
            this.ui.showToast('STRUCK BY THE CANTOR! Wounded — press [H] for Gauze or reach a Safe Haven!', 4.5, true);
          }
        }
      );

      this.audio.updateProximityAndCantor(
        this.player.pos,
        this.player.yaw,
        this.player.pitch,
        this.cantor.active,
        this.cantor.pos,
        this.cantor.state,
        cantorTick.occluded,
        this.lux.needleReading
      );

      // R4-AUDIO-01..03: Live physiology audio integration (breathing, wounded 620Hz muffling, pulsing chase heartbeat)
      this.audio.updatePhysiology(
        dt,
        this.player.stamina,
        sprintingNow,
        this.player.health,
        this.cantor.active && this.cantor.state !== 'TRAPPED',
        this.cantor.state,
        cantorTick.distance
      );

      if (this.mode === 'playing') {
        this.updateRaycastHover();
      }

      this.ui.updateHUD(
        dt,
        room.code,
        room.name,
        this.stateSys.getCurrentObjectiveText(),
        this.mode === 'playing' ? this.hoveredTarget?.label ?? null : null,
        this.player.health,
        Boolean(room.safeHaven),
        Boolean(this.player.hiddenSpot),
        this.player.stamina,
        this.lux.acquired,
        this.lux.mode,
        this.lux.charge,
        this.lux.needleReading
      );
    }

    this.renderFrameWithMetrics();
  }

  private renderFrameWithMetrics(): void {
    this.renderer.info.reset();
    this.gradePass.uniforms.uTime.value = this.elapsedTotal;
    this.composer.render();
    this.lastTotalDrawCalls = this.renderer.info.render.calls;
    this.lastTotalTriangles = this.renderer.info.render.triangles;
  }

  private installQABridge(): void {
    const computePerfStats = () => {
      const sorted = [...this.frameTimesMs].sort((a, b) => a - b);
      const medMs = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 16.67;
      const p95Ms = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 16.67;
      const info = this.renderer.info;
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return {
        webgl2: this.renderer.capabilities.isWebGL2,
        rendererName: this.rendererUnmasked,
        vendorName: this.vendorUnmasked,
        fpsMedian: Number((1000 / Math.max(0.1, medMs)).toFixed(1)),
        frameTimeMedianMs: Number(medMs.toFixed(2)),
        frameTimeP95Ms: Number(p95Ms.toFixed(2)),
        samplesCount: sorted.length,
        sceneDrawCalls: this.lastSceneDrawCalls,
        totalFrameDrawCalls: this.lastTotalDrawCalls,
        drawCalls: this.lastSceneDrawCalls,
        triangles: this.lastSceneTriangles,
        totalFrameTriangles: this.lastTotalTriangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        activeShadowLights: this.world.getActiveShadowLightsCount(),
        resolution: [this.canvas.width, this.canvas.height],
        optimizationProfile: this.world.isOptimizationEnabled() ? 'optimized' : 'baseline',
        jsHeapMB: mem ? Number((mem.usedJSHeapSize / 1048576).toFixed(2)) : null,
      };
    };

    const api: Record<string, unknown> = {
      isQAEnabled: () => this.qaEnabled,
      getTelemetry: () => {
        const room = this.player.resolveCurrentRoom();
        return {
          mode: this.mode,
          seed: this.seed,
          activeSimulationSeconds: Number(this.activeSimulationSeconds.toFixed(2)),
          sessionWallClockSeconds: Number(this.sessionWallClockSeconds.toFixed(2)),
          distanceWalkedMeters: Number(this.player.distanceWalked.toFixed(2)),
          player: {
            position: {
              x: Number(this.player.pos.x.toFixed(3)),
              y: Number(this.player.pos.y.toFixed(3)),
              z: Number(this.player.pos.z.toFixed(3)),
            },
            yaw: Number(this.player.yaw.toFixed(3)),
            pitch: Number(this.player.pitch.toFixed(3)),
            floor: this.player.resolveFloor(),
            currentRoomId: room.id,
            currentRoomName: room.name,
            safeHaven: Boolean(room.safeHaven),
            climbingLadder: Boolean(this.activeLadderClimb),
            stance: this.player.isCrouching ? 'crouch' : 'stand',
            lean: Number(this.player.leanAmount.toFixed(2)),
            stamina: Number(this.player.stamina.toFixed(1)),
            health: this.player.health,
            hiddenIn: this.player.hiddenSpot?.id ?? null,
            lampAcquired: this.lux.acquired,
            lampMode: this.lux.mode,
            lampCharge: Number(this.lux.charge.toFixed(1)),
            lampCalibrated: this.lux.calibrated,
            needleReading: Number(this.lux.needleReading.toFixed(3)),
            hoveredTarget: this.hoveredTarget,
          },
          cantor: {
            active: this.cantor.active,
            state: this.cantor.state,
            floor: this.cantor.floor,
            insideVault: this.cantor.isInsideContainmentVault(),
            position: {
              x: Number(this.cantor.pos.x.toFixed(2)),
              y: Number(this.cantor.pos.y.toFixed(2)),
              z: Number(this.cantor.pos.z.toFixed(2)),
            },
            targetPos: {
              x: Number(this.cantor.targetPos.x.toFixed(2)),
              y: Number(this.cantor.targetPos.y.toFixed(2)),
              z: Number(this.cantor.targetPos.z.toFixed(2)),
            },
            hasLOS: this.cantor.hasLOS,
            awareness: Number(this.cantor.awareness.toFixed(1)),
            doorBashTimer: Number(this.cantor.doorBashTimer.toFixed(2)),
            lastStimulus: this.cantor.lastStimulus,
          },
          world: {
            roomsCount: ROOMS.length,
            doorsCount: DOORS.length,
            interactablesTotal: this.world.interactables.size,
            loreCollectedCount: this.stateSys.collectedLore.size,
            shortcutsUnlocked: Array.from(this.stateSys.shortcutsUnlocked).sort(),
            inventory: { ...this.stateSys.inventory },
            flags: Array.from(this.stateSys.flags),
            puzzles: this.stateSys.puzzles,
            elevatorFloor: this.currentElevatorFloor,
            elevatorY: Number(this.world.elevatorY.toFixed(2)),
          },
          audio: this.audio.getTelemetry(),
          settings: this.settingsMgr.get(),
          renderer: computePerfStats(),
          qaAudit: { ...this.qaAudit },
        };
      },
      getWorldGraph: () => ({
        rooms: ROOMS,
        doors: DOORS,
        collidersCount: this.world.staticColliders.length,
      }),
      resetFrameSamples: () => {
        this.frameTimesMs.length = 0;
      },
      setOptimizationProfile: (optimized: boolean) => {
        this.world.setOptimizationEnabled(optimized);
        this.frameTimesMs.length = 0;
      },
    };

    if (this.qaEnabled) {
      api.qaLookAtPoint = (tx: number, ty: number, tz: number) => {
        this.qaAudit.programmaticLookCalls++;
        const dx = tx - this.camera.position.x;
        const dy = ty - this.camera.position.y;
        const dz = tz - this.camera.position.z;
        this.player.yaw = Math.atan2(-dx, -dz);
        const flat = Math.hypot(dx, dz) || 1;
        this.player.pitch = Math.max(-1.4, Math.min(1.4, Math.atan2(dy, flat)));
        this.player.enforceLookConstraints();
      };
      api.qaTeleport = (x: number, y: number, z: number, yaw?: number, pitch?: number) => {
        this.qaAudit.teleportsUsed++;
        this.player.hiddenSpot = null;
        this.activeLadderClimb = null;
        this.player.pos = { x, y, z };
        this.player.syncElevatorAttachment(this.world.elevatorY);
        if (yaw !== undefined) this.player.yaw = yaw;
        if (pitch !== undefined) this.player.pitch = pitch;
      };
      api.qaGiveItem = (itemId: string, qty = 1) => {
        this.qaAudit.stateInjectionsUsed++;
        this.stateSys.addItem(itemId, qty);
        if (itemId === 'lux_meter') this.lux.acquired = true;
      };
      api.qaSpawnCantor = (floor: FloorId, state?: CantorState, pos?: Vec3) => {
        this.qaAudit.stateInjectionsUsed++;
        this.cantor.spawnOnFloor(floor, 0);
        if (state) this.cantor.state = state;
        if (pos) this.cantor.pos = { ...pos };
      };
    }

    (window as unknown as { __VESPER_QA__: unknown }).__VESPER_QA__ = api;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new VesperWardGame();
});
