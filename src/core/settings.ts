import { GameSettings } from './types';

const STORAGE_KEY = 'vesper_ward_settings_v1';

export const DEFAULT_SETTINGS: GameSettings = {
  gamma: 1.06,
  masterVolume: 0.85,
  ambienceVolume: 0.75,
  sfxVolume: 0.85,
  voiceVolume: 0.9,
  subtitlesAndCaptions: true,
  fov: 82,
  mouseSensitivity: 1.0,
  invertY: false,
  disableHeadBob: false,
  reduceCameraShake: false,
  reduceFlashingLights: false,
  highContrastReticle: false,
};

export class SettingsManager {
  private current: GameSettings;
  private listeners: Array<(s: GameSettings) => void> = [];
  private memoryFallback: string | null = null;

  constructor() {
    this.current = this.load();
    this.applyDOMVariables();
  }

  private load(): GameSettings {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY) ?? this.memoryFallback;
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        gamma: this.clamp(parsed.gamma ?? DEFAULT_SETTINGS.gamma, 0.7, 1.45),
        masterVolume: this.clamp(parsed.masterVolume ?? DEFAULT_SETTINGS.masterVolume, 0, 1),
        ambienceVolume: this.clamp(parsed.ambienceVolume ?? DEFAULT_SETTINGS.ambienceVolume, 0, 1),
        sfxVolume: this.clamp(parsed.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume, 0, 1),
        voiceVolume: this.clamp(parsed.voiceVolume ?? DEFAULT_SETTINGS.voiceVolume, 0, 1),
        subtitlesAndCaptions: Boolean(parsed.subtitlesAndCaptions ?? DEFAULT_SETTINGS.subtitlesAndCaptions),
        fov: this.clamp(parsed.fov ?? DEFAULT_SETTINGS.fov, 70, 105),
        mouseSensitivity: this.clamp(parsed.mouseSensitivity ?? DEFAULT_SETTINGS.mouseSensitivity, 0.2, 2.5),
        invertY: Boolean(parsed.invertY ?? DEFAULT_SETTINGS.invertY),
        disableHeadBob: Boolean(parsed.disableHeadBob ?? DEFAULT_SETTINGS.disableHeadBob),
        reduceCameraShake: Boolean(parsed.reduceCameraShake ?? DEFAULT_SETTINGS.reduceCameraShake),
        reduceFlashingLights: Boolean(parsed.reduceFlashingLights ?? DEFAULT_SETTINGS.reduceFlashingLights),
        highContrastReticle: Boolean(parsed.highContrastReticle ?? DEFAULT_SETTINGS.highContrastReticle),
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  public get(): GameSettings {
    return { ...this.current };
  }

  public update(patch: Partial<GameSettings>): GameSettings {
    this.current = {
      ...this.current,
      ...patch,
    };
    this.current.gamma = this.clamp(this.current.gamma, 0.7, 1.45);
    this.current.fov = this.clamp(this.current.fov, 70, 105);
    this.current.mouseSensitivity = this.clamp(this.current.mouseSensitivity, 0.2, 2.5);
    this.current.masterVolume = this.clamp(this.current.masterVolume, 0, 1);
    this.current.ambienceVolume = this.clamp(this.current.ambienceVolume, 0, 1);
    this.current.sfxVolume = this.clamp(this.current.sfxVolume, 0, 1);
    this.current.voiceVolume = this.clamp(this.current.voiceVolume, 0, 1);

    const serialized = JSON.stringify(this.current);
    this.memoryFallback = serialized;
    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      // Safe fallback when storage is sandboxed
    }
    this.applyDOMVariables();
    for (const fn of this.listeners) {
      fn(this.get());
    }
    return this.get();
  }

  public reset(): GameSettings {
    return this.update({ ...DEFAULT_SETTINGS });
  }

  public onChange(fn: (s: GameSettings) => void): void {
    this.listeners.push(fn);
  }

  private applyDOMVariables(): void {
    const lift = Math.max(0, (this.current.gamma - 1.0) * 0.22);
    document.documentElement.style.setProperty('--gamma-lift', lift.toFixed(4));
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  }
}
