import { PuzzleRuntimeState, SaveSnapshot } from './types';

const SAVE_SLOT_AUTO = 'vesper_ward_save_auto_v1';
const SAVE_SLOT_MANUAL = 'vesper_ward_save_manual_v1';

export function createInitialPuzzleState(): PuzzleRuntimeState {
  return {
    mountedPlates: [],
    radiologySafeUnlocked: false,
    enteredSafeCode: '',
    conduitBoxOpened: false,
    // Start with V2 open (+25) and V3 closed so initial pressure is 40 PSI; player opens V1 (+40), keeps V2 (+25), opens V3 (-20) -> 60 PSI
    steamValves: [false, true, false],
    steamSolved: false,
    freightBusEngaged: false,
    crtQueryInput: '',
    crtLastQuery: '',
    crtSubjectQueried: false,
    cryoDrawerOpened: false,
    dumbwaiterCleared: false,
    reelMounted: false,
    oscFreq: 72,
    oscPhase: 60,
    oscAtten: -24,
    oscillatorSolved: false,
    substationFuseInserted: false,
    phaseSwitches: [false, false, false, false],
    substationSolved: false,
    lure1Triggered: false,
    lure2Triggered: false,
    cantorContained: false,
  };
}

export class SaveSystem {
  private memoryStore: Record<string, string> = {};

  public save(snapshot: SaveSnapshot, manual = false): void {
    const raw = JSON.stringify(snapshot);
    const key = manual ? SAVE_SLOT_MANUAL : SAVE_SLOT_AUTO;
    this.memoryStore[key] = raw;
    try {
      window.localStorage.setItem(key, raw);
      if (manual) {
        window.localStorage.setItem(SAVE_SLOT_AUTO, raw);
        this.memoryStore[SAVE_SLOT_AUTO] = raw;
      }
    } catch {
      // Safe memory fallback
    }
  }

  public loadLatest(): SaveSnapshot | null {
    const auto = this.readKey(SAVE_SLOT_AUTO);
    const manual = this.readKey(SAVE_SLOT_MANUAL);
    if (auto && manual) {
      return auto.timestamp >= manual.timestamp ? auto : manual;
    }
    return auto ?? manual;
  }

  public loadManual(): SaveSnapshot | null {
    return this.readKey(SAVE_SLOT_MANUAL);
  }

  public hasAnySave(): boolean {
    return this.loadLatest() !== null;
  }

  public clearAll(): void {
    delete this.memoryStore[SAVE_SLOT_AUTO];
    delete this.memoryStore[SAVE_SLOT_MANUAL];
    try {
      window.localStorage.removeItem(SAVE_SLOT_AUTO);
      window.localStorage.removeItem(SAVE_SLOT_MANUAL);
    } catch {
      // Ignore
    }
  }

  private readKey(key: string): SaveSnapshot | null {
    try {
      const raw = window.localStorage.getItem(key) ?? this.memoryStore[key];
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SaveSnapshot;
      if (!parsed || parsed.version !== 1) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
