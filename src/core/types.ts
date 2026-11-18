export type FloorId = 'G2' | 'G1' | 'B1' | 'B2' | 'B3';

export type ZonePaletteId =
  | 'G1_SANATORIUM'
  | 'G2_SURGICAL'
  | 'B1_ARCHIVE'
  | 'B2_ANECHOIC'
  | 'B3_SUBSTATION'
  | 'COURTYARD_DAWN';

export type GameMode =
  | 'title'
  | 'playing'
  | 'paused'
  | 'settings'
  | 'inventory'
  | 'examine'
  | 'puzzle'
  | 'lore_modal'
  | 'dead'
  | 'ending'
  | 'credits';

export type LampMode = 0 | 1 | 2; // 0 = Off, 1 = Tungsten Beam, 2 = Ruby Darkroom Filter

export type CantorState = 'PATROL' | 'INVESTIGATE' | 'CHASE' | 'COOLDOWN' | 'TRAPPED';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  tag?: string;
  blocksLOS?: boolean;
  doorId?: string;
}

export interface StairRamp {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  yStart: number;
  yEnd: number;
  axis: 'x' | 'z';
  ceilingY: number;
}

export interface RoomDef {
  id: string;
  code: string;
  name: string;
  floor: FloorId;
  zone: ZonePaletteId;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  safeHaven?: boolean;
  safeEntry: Vec3;
  ambientType:
    | 'rain_hall'
    | 'surgical_hum'
    | 'hvac_b1'
    | 'anechoic_dead'
    | 'cryo_mist'
    | 'turbine_b3'
    | 'dawn_courtyard';
  description: string;
}

export interface DoorDef {
  id: string;
  label: string;
  floor: FloorId;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  axis: 'x' | 'z';
  initialOpen?: boolean;
  lockedBy?: {
    type: 'item' | 'shortcut_from_side' | 'flag' | 'puzzle';
    keyId?: string;
    shortcutIndex?: number; // 1..5
    unlockSide?: 'pos' | 'neg';
    flag?: string;
    hintText: string;
  };
  isEmergencyRelease?: boolean;
  style: 'wood_ward' | 'glass_double' | 'steel_bulkhead' | 'ladder_hatch' | 'blast_vault' | 'iron_gate';
}

export interface HidingSpotDef {
  id: string;
  label: string;
  roomId: string;
  floor: FloorId;
  pos: Vec3;
  hideCameraPos: Vec3;
  facingYaw: number;
  kind: 'locker' | 'surgical_drape' | 'curtain_alcove';
}

export type InteractableKind =
  | 'pickup_item'
  | 'lore_doc'
  | 'audio_reel'
  | 'puzzle_station'
  | 'hiding_spot'
  | 'save_recorder'
  | 'elevator_call'
  | 'elevator_panel'
  | 'shortcut_latch'
  | 'pneumatic_buzzer'
  | 'climax_lure'
  | 'climax_lever'
  | 'supply_drawer'
  | 'condemnation_switch'
  | 'exit_gate'
  | 'conduit_junction';

export interface InteractableDef {
  id: string;
  label: string;
  kind: InteractableKind;
  roomId: string;
  floor: FloorId;
  pos: Vec3;
  itemId?: string;
  loreId?: string;
  puzzleId?: PuzzleId;
  elevatorTarget?: FloorId;
  lureIndex?: 1 | 2;
  requiresFlag?: string;
  setsFlag?: string;
  consumesItem?: string;
  inspectedOnce?: boolean;
}

export type PuzzleId =
  | 'puzzle1_radiology'
  | 'puzzle2_steam'
  | 'puzzle3_archive_crt'
  | 'puzzle4_oscillator'
  | 'puzzle5_substation';

export interface ItemDef {
  id: string;
  name: string;
  category: 'tool' | 'key' | 'puzzle' | 'consumable';
  essential: boolean;
  stackable?: boolean;
  description: string;
  examinerModel:
    | 'lux_meter'
    | 'pocket_watch'
    | 'fuse_holder'
    | 'fuse_wire'
    | 'restored_fuse'
    | 'service_key'
    | 'xray_plate'
    | 'reel_hub'
    | 'tape_spool'
    | 'calibration_reel'
    | 'vial'
    | 'cell'
    | 'injector';
  examineSecretFlag?: string;
  examineSecretText?: string;
}

export interface CombinationRecipe {
  itemA: string;
  itemB: string;
  requiresFlag?: string;
  requiresHint?: string;
  resultItem: string;
  setsFlag: string;
  message: string;
}

export interface LoreEntryDef {
  id: string;
  number: number;
  title: string;
  author: string;
  date: string;
  medium: 'Document' | 'Audio Transcript' | 'Clinical Ledger';
  roomId: string;
  body: string;
}

export interface GameSettings {
  gamma: number; // 0.7 .. 1.45, default 1.06
  masterVolume: number; // 0..1
  ambienceVolume: number; // 0..1
  sfxVolume: number; // 0..1
  voiceVolume: number; // 0..1
  subtitlesAndCaptions: boolean;
  fov: number; // 70..105
  mouseSensitivity: number; // 0.2..2.5
  invertY: boolean;
  disableHeadBob: boolean;
  reduceCameraShake: boolean;
  reduceFlashingLights: boolean;
  highContrastReticle: boolean;
}

export interface PuzzleRuntimeState {
  // Puzzle 1: Radiology
  mountedPlates: string[];
  radiologySafeUnlocked: boolean;
  enteredSafeCode: string;
  // Puzzle 2: 3-Valve Hydrotherapy Steam Manifold (Base 15: V1 +40, V2 +25, V3 -20 = 60 PSI)
  conduitBoxOpened: boolean;
  steamValves: [boolean, boolean, boolean];
  steamSolved: boolean;
  freightBusEngaged: boolean;
  // Puzzle 3: B1 CRT & Cold Archives + G2/B1 Dumbwaiter Chute
  crtQueryInput: string;
  crtLastQuery: string;
  crtSubjectQueried: boolean;
  cryoDrawerOpened: boolean;
  dumbwaiterCleared: boolean;
  // Puzzle 4: B2 Oscillator (Target: 108 Hz, 180 deg, -12 dB)
  reelMounted: boolean;
  oscFreq: number;
  oscPhase: number;
  oscAtten: number;
  oscillatorSolved: boolean;
  // Puzzle 5: B3 Substation & Containment Lock
  substationFuseInserted: boolean;
  phaseSwitches: [boolean, boolean, boolean, boolean];
  substationSolved: boolean;
  lure1Triggered: boolean;
  lure2Triggered: boolean;
  cantorContained: boolean;
}

export interface SaveSnapshot {
  version: number;
  timestamp: string;
  checkpointLabel: string;
  seed: number;
  elapsedPlaySeconds: number;
  distanceWalkedMeters: number;
  playerPos: Vec3;
  playerYaw: number;
  playerPitch: number;
  playerFloor: FloorId;
  health: number;
  lampMode: LampMode;
  lampCharge: number;
  lampCalibrated: boolean;
  inventory: Record<string, number>;
  collectedInteractables: string[];
  collectedLore: string[];
  flags: string[];
  openDoors: string[];
  unlockedDoors: string[];
  shortcutsUnlocked: number[];
  elevatorFloor: FloorId;
  puzzles: PuzzleRuntimeState;
  cantorActive: boolean;
  cantorTrapped: boolean;
}
