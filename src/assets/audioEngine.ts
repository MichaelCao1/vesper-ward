import { CantorState, GameSettings, RoomDef, Vec3 } from '../core/types';

export type CaptionCallback = (text: string, danger?: boolean) => void;

export interface AudioTelemetrySnapshot {
  contextState: string;
  pannerConnected: boolean;
  voiceBusConnected: boolean;
  voiceGainLevel: number;
  voiceLogsPlayedCount: number;
  activeVoiceReelId: string | null;
  injuryMuffled: boolean;
  injuryCutoffHz: number;
  breathingActive: boolean;
  breathingGain: number;
  heartbeatActive: boolean;
  heartbeatBpm: number;
  listenerPos: Vec3;
  listenerForward: Vec3;
  cantorSourcePos: Vec3;
  cantorOcclusionHz: number;
  cantorStereoAzimuth: number;
  lastSpatialSfxPos: Vec3 | null;
}

export class SpatialAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private injuryMuffleFilter: BiquadFilterNode | null = null;
  private ambienceGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;

  private ambientOscA: OscillatorNode | null = null;
  private ambientOscB: OscillatorNode | null = null;
  private ambientNoiseGain: GainNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private sharedNoiseBuffer: AudioBuffer | null = null;

  private cantorDroneOsc: OscillatorNode | null = null;
  private cantorHarmonicOsc: OscillatorNode | null = null;
  private cantorGain: GainNode | null = null;
  private cantorFilter: BiquadFilterNode | null = null;
  private cantorPanner: PannerNode | null = null;
  private cantorStereoTrim: StereoPannerNode | null = null;

  private dosimeterOsc: OscillatorNode | null = null;
  private dosimeterGain: GainNode | null = null;

  // R4-AUDIO-01 & R4-AUDIO-03: Sprint/recovery respiration + rhythmic chase heartbeat synthesis
  private breathFormantA: BiquadFilterNode | null = null;
  private breathFormantB: BiquadFilterNode | null = null;
  private breathGain: GainNode | null = null;
  private breathPhase = 0;
  private currentBreathLevel = 0;
  private breathingActive = false;

  private heartbeatOsc: OscillatorNode | null = null;
  private heartbeatGain: GainNode | null = null;
  private heartbeatPhase = 0;
  private currentHeartbeatBpm = 0;
  private heartbeatActive = false;

  private isWoundedMuffled = false;
  private currentInjuryCutoffHz = 18000;

  private activeVoiceNodes: Array<{ stop: () => void }> = [];
  private activeVoiceReelId: string | null = null;
  private voiceLogsPlayedCount = 0;

  private currentAmbientType: RoomDef['ambientType'] | null = null;
  private settings: GameSettings;
  private onCaption: CaptionCallback;
  private lastCantorCaptionState: CantorState | null = null;
  private lastCaptionTimestamps = new Map<string, number>();

  private listenerPos: Vec3 = { x: 0, y: 1.6, z: 0 };
  private listenerForward: Vec3 = { x: 0, y: 0, z: -1 };
  private cantorSourcePos: Vec3 = { x: 0, y: 0, z: 0 };
  private cantorOcclusionHz = 950;
  private cantorAzimuth = 0;
  private lastSpatialSfxPos: Vec3 | null = null;

  constructor(initialSettings: GameSettings, onCaption: CaptionCallback) {
    this.settings = initialSettings;
    this.onCaption = onCaption;
  }

  public getTelemetry(): AudioTelemetrySnapshot {
    return {
      contextState: this.ctx ? this.ctx.state : 'uninitialized',
      pannerConnected: Boolean(this.cantorPanner),
      voiceBusConnected: Boolean(this.voiceGain),
      voiceGainLevel: Number((this.settings.voiceVolume * 0.85).toFixed(3)),
      voiceLogsPlayedCount: this.voiceLogsPlayedCount,
      activeVoiceReelId: this.activeVoiceReelId,
      injuryMuffled: this.isWoundedMuffled,
      injuryCutoffHz: Math.round(this.currentInjuryCutoffHz),
      breathingActive: this.breathingActive,
      breathingGain: Number(this.currentBreathLevel.toFixed(4)),
      heartbeatActive: this.heartbeatActive,
      heartbeatBpm: Math.round(this.currentHeartbeatBpm),
      listenerPos: { ...this.listenerPos },
      listenerForward: { ...this.listenerForward },
      cantorSourcePos: { ...this.cantorSourcePos },
      cantorOcclusionHz: Math.round(this.cantorOcclusionHz),
      cantorStereoAzimuth: Number(this.cantorAzimuth.toFixed(3)),
      lastSpatialSfxPos: this.lastSpatialSfxPos ? { ...this.lastSpatialSfxPos } : null,
    };
  }

  public unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.injuryMuffleFilter = this.ctx.createBiquadFilter();
      this.injuryMuffleFilter.type = 'lowpass';
      this.injuryMuffleFilter.frequency.value = 18000;
      this.injuryMuffleFilter.Q.value = 0.85;

      this.ambienceGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.voiceGain = this.ctx.createGain();

      // Ambience & world SFX route through injuryMuffleFilter so wounded state muffles perception cleanly!
      this.ambienceGain.connect(this.injuryMuffleFilter);
      this.sfxGain.connect(this.injuryMuffleFilter);
      this.injuryMuffleFilter.connect(this.masterGain);
      this.voiceGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.setupAmbientChain();
      this.setupCantorSpatialChain();
      this.setupDosimeterChain();
      this.setupPhysiologyChains();
      this.applySettings(this.settings);
    } catch {
      this.ctx = null;
    }
  }

  public applySettings(s: GameSettings): void {
    this.settings = s;
    if (!this.ctx || !this.masterGain || !this.ambienceGain || !this.sfxGain || !this.voiceGain) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(s.masterVolume, t, 0.04);
    this.ambienceGain.gain.setTargetAtTime(s.ambienceVolume * 0.45, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(s.sfxVolume * 0.78, t, 0.04);
    this.voiceGain.gain.setTargetAtTime(s.voiceVolume * 0.85, t, 0.04);
  }

  // Synthesized damaged magnetic reel / dual-formant cadence routed strictly through voiceGain (accompanied by full written transcript)
  public playVoiceReelLog(reelId: string): void {
    this.stopVoiceReelLog();
    this.voiceLogsPlayedCount++;
    this.activeVoiceReelId = reelId;

    const speakerTitle =
      reelId === 'lore_08_vane_study_reel'
        ? 'Dr. Henrik Vane'
        : reelId === 'lore_13_observation_gallery_reel'
        ? 'Dr. Clara Orlov'
        : 'Emergency Containment Log';
    this.emitThrottledCaption(`voice_${reelId}`, `[Damaged Magnetic Reel — ${speakerTitle}]`, false, 600);

    if (!this.ctx || !this.voiceGain) return;
    const t0 = this.ctx.currentTime;
    const duration = 5.4;

    let tapeSrc: AudioBufferSourceNode | null = null;
    if (this.sharedNoiseBuffer) {
      tapeSrc = this.ctx.createBufferSource();
      tapeSrc.buffer = this.sharedNoiseBuffer;
      tapeSrc.loop = true;
      const hissBand = this.ctx.createBiquadFilter();
      hissBand.type = 'bandpass';
      hissBand.frequency.value = 1750;
      hissBand.Q.value = 1.4;
      const hissGain = this.ctx.createGain();
      hissGain.gain.setValueAtTime(0.05, t0);
      hissGain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
      tapeSrc.connect(hissBand);
      hissBand.connect(hissGain);
      hissGain.connect(this.voiceGain);
      tapeSrc.start(t0);
      tapeSrc.stop(t0 + duration);
    }

    const basePitch = reelId === 'lore_08_vane_study_reel' ? 118 : 182;
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(basePitch, t0);

    const formant1 = this.ctx.createBiquadFilter();
    formant1.type = 'bandpass';
    formant1.frequency.setValueAtTime(520, t0);
    formant1.Q.value = 5.5;

    const formant2 = this.ctx.createBiquadFilter();
    formant2.type = 'bandpass';
    formant2.frequency.setValueAtTime(1420, t0);
    formant2.Q.value = 6.5;

    const syllableEnv = this.ctx.createGain();
    syllableEnv.gain.setValueAtTime(0.001, t0);

    for (let i = 0; i < 18; i++) {
      const st = t0 + 0.18 + i * 0.27;
      const pause = i % 6 === 5;
      const amp = pause ? 0.004 : 0.16 + ((i * 37) % 10) * 0.008;
      const pitchMod = basePitch * (0.92 + ((i * 19) % 13) * 0.014);
      const f1Mod = 410 + ((i * 53) % 7) * 55;
      const f2Mod = 1180 + ((i * 29) % 9) * 85;

      carrier.frequency.setTargetAtTime(pitchMod, st, 0.04);
      formant1.frequency.setTargetAtTime(f1Mod, st, 0.03);
      formant2.frequency.setTargetAtTime(f2Mod, st, 0.03);
      syllableEnv.gain.setTargetAtTime(amp, st, 0.025);
      syllableEnv.gain.setTargetAtTime(0.012, st + 0.17, 0.03);
    }
    syllableEnv.gain.setTargetAtTime(0.0001, t0 + duration - 0.15, 0.04);

    carrier.connect(formant1);
    carrier.connect(formant2);
    formant1.connect(syllableEnv);
    formant2.connect(syllableEnv);
    syllableEnv.connect(this.voiceGain);

    carrier.start(t0);
    carrier.stop(t0 + duration);

    const handle = {
      stop: () => {
        try {
          carrier.stop();
          tapeSrc?.stop();
        } catch {
          // Already stopped
        }
        if (this.activeVoiceReelId === reelId) {
          this.activeVoiceReelId = null;
        }
      },
    };
    this.activeVoiceNodes.push(handle);
    window.setTimeout(() => {
      if (this.activeVoiceReelId === reelId) {
        this.activeVoiceReelId = null;
      }
    }, duration * 1000 + 100);
  }

  public stopVoiceReelLog(): void {
    while (this.activeVoiceNodes.length > 0) {
      this.activeVoiceNodes.pop()?.stop();
    }
    this.activeVoiceReelId = null;
  }

  // R4-AUDIO-01..03: Updates injury muffling, sprint/recovery breathing, and rhythmic chase heartbeat every simulation step!
  public updatePhysiology(
    dt: number,
    stamina: number,
    sprintingNow: boolean,
    health: number,
    cantorActive: boolean,
    cantorState: CantorState,
    cantorDist: number
  ): void {
    // 1. Injury-dependent low-pass muffling (health === 1 muffles world to 620 Hz; health >= 2 restores 18000 Hz)
    const wounded = health === 1;
    this.isWoundedMuffled = wounded;
    const targetCutoff = wounded ? 620 : 18000;
    this.currentInjuryCutoffHz += (targetCutoff - this.currentInjuryCutoffHz) * Math.min(1, dt * 8);
    if (this.ctx && this.injuryMuffleFilter) {
      this.injuryMuffleFilter.frequency.setTargetAtTime(targetCutoff, this.ctx.currentTime, 0.12);
    }

    // 2. Audible sprint & stamina-recovery respiration
    const fatigue = Math.max(0, Math.min(1, (86 - stamina) / 80));
    const woundBreathFloor = wounded ? 0.32 : 0;
    const sprintBoost = sprintingNow ? 0.38 : 0;
    const exertion = Math.max(woundBreathFloor, Math.min(1, fatigue * 0.85 + sprintBoost));
    this.breathingActive = exertion > 0.05;

    if (this.breathingActive) {
      const breathRateHz = 0.62 + exertion * 0.82;
      this.breathPhase = (this.breathPhase + dt * breathRateHz) % 1.0;
      // Realistic two-stage inhale (0.00..0.42) + slightly longer exhale (0.48..0.94) envelope
      let env = 0;
      let isExhale = false;
      if (this.breathPhase < 0.42) {
        env = Math.sin((this.breathPhase / 0.42) * Math.PI);
      } else if (this.breathPhase >= 0.48 && this.breathPhase < 0.94) {
        env = Math.sin(((this.breathPhase - 0.48) / 0.46) * Math.PI) * 1.15;
        isExhale = true;
      }
      this.currentBreathLevel = env * exertion * 0.24;

      if (sprintingNow && stamina < 42) {
        this.emitThrottledCaption('breath_sprint', '[Ragged sprint breathing — stamina low]', false, 4200);
      } else if (!sprintingNow && stamina < 32) {
        this.emitThrottledCaption('breath_recover', '[Catching breath...]', false, 5000);
      }

      if (this.ctx && this.breathGain && this.breathFormantA && this.breathFormantB) {
        const t = this.ctx.currentTime;
        this.breathFormantA.frequency.setTargetAtTime(isExhale ? 390 : 490, t, 0.04);
        this.breathFormantB.frequency.setTargetAtTime(isExhale ? 1080 : 1340, t, 0.04);
        this.breathGain.gain.setTargetAtTime(Math.max(0.0001, this.currentBreathLevel), t, 0.03);
      }
    } else {
      this.currentBreathLevel = 0;
      if (this.ctx && this.breathGain) {
        this.breathGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.12);
      }
    }

    // 3. Pulsing cardiac lub-dub chase / danger heartbeat
    const inChase = cantorActive && cantorState === 'CHASE';
    const nearThreat = cantorActive && cantorState === 'INVESTIGATE' && cantorDist < 13.5;
    this.heartbeatActive = inChase || nearThreat || wounded;

    if (this.heartbeatActive) {
      const bpm = inChase ? 132 : nearThreat ? 96 : 82;
      this.currentHeartbeatBpm = bpm;
      const prevPhase = this.heartbeatPhase;
      this.heartbeatPhase = (this.heartbeatPhase + dt * (bpm / 60)) % 1.0;

      // Trigger discrete lub-dub cardiac pressure transients on each beat cycle!
      let pulseAmp = 0;
      let pulseFreq = 50;
      if (this.heartbeatPhase < 0.11) {
        // Primary "LUB" systole thump
        pulseAmp = Math.sin((this.heartbeatPhase / 0.11) * Math.PI);
        pulseFreq = 58 - (this.heartbeatPhase / 0.11) * 16;
      } else if (this.heartbeatPhase >= 0.21 && this.heartbeatPhase < 0.32) {
        // Secondary "DUB" aortic valve closure
        const sub = (this.heartbeatPhase - 0.21) / 0.11;
        pulseAmp = Math.sin(sub * Math.PI) * 0.78;
        pulseFreq = 68 - sub * 18;
      }

      const intensityScale = inChase ? 0.36 : nearThreat ? 0.2 : 0.16;
      if (inChase && prevPhase > this.heartbeatPhase) {
        this.emitThrottledCaption('chase_heartbeat', '[Heartbeat pounding — The Cantor in pursuit!]', true, 4400);
      }

      if (this.ctx && this.heartbeatOsc && this.heartbeatGain) {
        const t = this.ctx.currentTime;
        this.heartbeatOsc.frequency.setTargetAtTime(pulseFreq, t, 0.015);
        this.heartbeatGain.gain.setTargetAtTime(Math.max(0.0001, pulseAmp * intensityScale), t, 0.015);
      }
    } else {
      this.currentHeartbeatBpm = 0;
      if (this.ctx && this.heartbeatGain) {
        this.heartbeatGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
      }
    }
  }

  public resetPhysiologyImmediate(): void {
    this.isWoundedMuffled = false;
    this.currentInjuryCutoffHz = 18000;
    this.breathingActive = false;
    this.currentBreathLevel = 0;
    this.heartbeatActive = false;
    this.currentHeartbeatBpm = 0;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.injuryMuffleFilter?.frequency.setTargetAtTime(18000, t, 0.04);
    this.breathGain?.gain.setTargetAtTime(0.0001, t, 0.04);
    this.heartbeatGain?.gain.setTargetAtTime(0.0001, t, 0.04);
  }

  public updateListenerTransform(pos: Vec3, yaw: number, pitch = 0): void {
    const fx = -Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * Math.cos(pitch);
    this.listenerPos = { x: pos.x, y: pos.y + 1.58, z: pos.z };
    this.listenerForward = { x: fx, y: fy, z: fz };

    if (!this.ctx) return;
    const listener = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (listener.positionX) {
      listener.positionX.setTargetAtTime(this.listenerPos.x, t, 0.02);
      listener.positionY.setTargetAtTime(this.listenerPos.y, t, 0.02);
      listener.positionZ.setTargetAtTime(this.listenerPos.z, t, 0.02);
      listener.forwardX.setTargetAtTime(fx, t, 0.02);
      listener.forwardY.setTargetAtTime(fy, t, 0.02);
      listener.forwardZ.setTargetAtTime(fz, t, 0.02);
      listener.upX.setValueAtTime(0, t);
      listener.upY.setValueAtTime(1, t);
      listener.upZ.setValueAtTime(0, t);
    } else {
      listener.setPosition(this.listenerPos.x, this.listenerPos.y, this.listenerPos.z);
      listener.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  public setZoneAmbience(type: RoomDef['ambientType']): void {
    if (this.currentAmbientType === type) return;
    this.currentAmbientType = type;

    if (this.settings.subtitlesAndCaptions) {
      const labels: Record<RoomDef['ambientType'], string> = {
        rain_hall: '[Rain pattering against sanatorium skylight]',
        surgical_hum: '[Ballast hum & distant surgical draft]',
        hvac_b1: '[Sub-basal ventilation ducts rattling]',
        anechoic_dead: '[Deadened anechoic pressure — near-total silence]',
        cryo_mist: '[Cryogenic nitrogen vents hissing]',
        turbine_b3: '[Deep 60 Hz substation transformer thrum]',
        dawn_courtyard: '[Cold dawn rain across hillside courtyard]',
      };
      this.emitThrottledCaption(`amb_${type}`, labels[type], false, 8000);
    }

    if (!this.ctx || !this.ambientOscA || !this.ambientOscB || !this.ambientFilter || !this.ambientNoiseGain) return;
    const t = this.ctx.currentTime;
    switch (type) {
      case 'rain_hall':
        this.ambientOscA.frequency.setTargetAtTime(55, t, 0.4);
        this.ambientOscB.frequency.setTargetAtTime(82.5, t, 0.4);
        this.ambientFilter.frequency.setTargetAtTime(680, t, 0.4);
        this.ambientNoiseGain.gain.setTargetAtTime(0.16, t, 0.4);
        break;
      case 'surgical_hum':
        this.ambientOscA.frequency.setTargetAtTime(120, t, 0.4);
        this.ambientOscB.frequency.setTargetAtTime(180, t, 0.4);
        this.ambientFilter.frequency.setTargetAtTime(420, t, 0.4);
        this.ambientNoiseGain.gain.setTargetAtTime(0.07, t, 0.4);
        break;
      case 'hvac_b1':
        this.ambientOscA.frequency.setTargetAtTime(48, t, 0.4);
        this.ambientOscB.frequency.setTargetAtTime(73, t, 0.4);
        this.ambientFilter.frequency.setTargetAtTime(310, t, 0.4);
        this.ambientNoiseGain.gain.setTargetAtTime(0.12, t, 0.4);
        break;
      case 'anechoic_dead':
        this.ambientOscA.frequency.setTargetAtTime(38, t, 0.4);
        this.ambientOscB.frequency.setTargetAtTime(39.5, t, 0.4);
        this.ambientFilter.frequency.setTargetAtTime(140, t, 0.4);
        this.ambientNoiseGain.gain.setTargetAtTime(0.015, t, 0.4);
        break;
      case 'cryo_mist':
        this.ambientOscA.frequency.setTargetAtTime(64, t, 0.4);
        this.ambientOscB.frequency.setTargetAtTime(96, t, 0.4);
        this.ambientFilter.frequency.setTargetAtTime(1250, t, 0.4);
        this.ambientNoiseGain.gain.setTargetAtTime(0.14, t, 0.4);
        break;
      case 'turbine_b3':
        this.ambientOscA.frequency.setTargetAtTime(60, t, 0.4);
        this.ambientOscB.frequency.setTargetAtTime(120.4, t, 0.4);
        this.ambientFilter.frequency.setTargetAtTime(290, t, 0.4);
        this.ambientNoiseGain.gain.setTargetAtTime(0.18, t, 0.4);
        break;
      case 'dawn_courtyard':
        this.ambientOscA.frequency.setTargetAtTime(72, t, 0.4);
        this.ambientOscB.frequency.setTargetAtTime(108, t, 0.4);
        this.ambientFilter.frequency.setTargetAtTime(980, t, 0.4);
        this.ambientNoiseGain.gain.setTargetAtTime(0.19, t, 0.4);
        break;
    }
  }

  public playFootstep(surface: 'terrazzo' | 'puddle' | 'grate' | 'glass' | 'crouch'): void {
    if (surface === 'glass') {
      this.emitThrottledCaption('glass_crunch', '[Broken glass crunches underfoot!]', true, 1200);
    } else if (surface === 'puddle') {
      this.emitThrottledCaption('puddle_step', '[Water splash underfoot]', false, 3000);
    }
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    if (surface === 'puddle') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.09);
      g.gain.setValueAtTime(0.18, t);
    } else if (surface === 'grate') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(480, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.07);
      g.gain.setValueAtTime(0.14, t);
    } else if (surface === 'glass') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1650, t);
      osc.frequency.exponentialRampToValueAtTime(520, t + 0.12);
      g.gain.setValueAtTime(0.28, t);
    } else if (surface === 'crouch') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(135, t);
      osc.frequency.exponentialRampToValueAtTime(65, t + 0.06);
      g.gain.setValueAtTime(0.05, t);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(85, t + 0.065);
      g.gain.setValueAtTime(0.11, t);
    }

    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  public playDynamoClick(): void {
    this.emitThrottledCaption('dynamo', '[Dynamo clicking — audible to nearby threats]', true, 1600);
    this.playToneBurst(690, 980, 0.055, 'sawtooth', 0.18);
  }

  public playInteraction(
    kind: 'door_open' | 'door_locked' | 'pickup' | 'switch' | 'vial_shatter' | 'lure_horn' | 'heal' | 'hit' | 'door_bash',
    worldSourcePos?: Vec3,
    occluded = false
  ): void {
    const captions: Partial<Record<typeof kind, [string, boolean]>> = {
      door_locked: ['[Latch rattles — locked]', false],
      vial_shatter: ['[Specimen glass shatters loudly!]', true],
      lure_horn: ['[Pneumatic acoustic lure resonates!]', true],
      door_bash: ['[The Cantor slams against closed door!]', true],
      hit: ['[Thoracic rig impact — Mara wounded & hearing muffled!]', true],
      heal: ['[Gauze syrette applied — breathing & hearing steady]', false],
    };
    const cap = captions[kind];
    if (cap) {
      let suffix = '';
      if (worldSourcePos) {
        const dx = worldSourcePos.x - this.listenerPos.x;
        const dz = worldSourcePos.z - this.listenerPos.z;
        const yaw = Math.atan2(-this.listenerForward.x, -this.listenerForward.z);
        suffix = ` (${this.computeRelativeDirection(dx, dz, yaw).dir})`;
      }
      this.emitThrottledCaption(`sfx_${kind}`, `${cap[0].slice(0, -1)}${suffix}]`, cap[1], 700);
    }

    switch (kind) {
      case 'door_open':
        this.playToneBurst(160, 110, 0.18, 'triangle', 0.2, worldSourcePos, occluded);
        break;
      case 'door_locked':
        this.playToneBurst(310, 260, 0.08, 'square', 0.16, worldSourcePos, occluded);
        break;
      case 'pickup':
        this.playToneBurst(520, 760, 0.09, 'sine', 0.15);
        break;
      case 'switch':
        this.playToneBurst(280, 440, 0.14, 'square', 0.22, worldSourcePos, occluded);
        break;
      case 'vial_shatter':
        this.playToneBurst(1920, 480, 0.28, 'sawtooth', 0.38, worldSourcePos, occluded);
        break;
      case 'lure_horn':
        this.playToneBurst(216, 432, 0.65, 'sawtooth', 0.4, worldSourcePos, occluded);
        break;
      case 'door_bash':
        this.playToneBurst(95, 42, 0.34, 'sawtooth', 0.45, worldSourcePos, occluded);
        break;
      case 'hit':
        this.playToneBurst(140, 48, 0.42, 'sawtooth', 0.48);
        break;
      case 'heal':
        this.playToneBurst(380, 620, 0.25, 'sine', 0.2);
        break;
    }
  }

  public updateProximityAndCantor(
    playerPos: Vec3,
    playerYaw: number,
    playerPitch: number,
    cantorActive: boolean,
    cantorPos: Vec3,
    cantorState: CantorState,
    occluded: boolean,
    harmonicIntensity: number
  ): void {
    this.updateListenerTransform(playerPos, playerYaw, playerPitch);

    if (this.ctx && this.dosimeterGain && this.dosimeterOsc) {
      const t = this.ctx.currentTime;
      this.dosimeterOsc.frequency.setTargetAtTime(108 + harmonicIntensity * 94, t, 0.08);
      this.dosimeterGain.gain.setTargetAtTime(harmonicIntensity > 0.18 ? harmonicIntensity * 0.055 : 0.0001, t, 0.08);
    }

    if (!cantorActive || cantorState === 'TRAPPED') {
      if (this.ctx && this.cantorGain) {
        this.cantorGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
      }
      return;
    }

    this.cantorSourcePos = { x: cantorPos.x, y: cantorPos.y + 1.4, z: cantorPos.z };
    const dx = cantorPos.x - playerPos.x;
    const dy = cantorPos.y - playerPos.y;
    const dz = cantorPos.z - playerPos.z;
    const dist = Math.hypot(dx, dy * 1.4, dz);

    const { dir: dirLabel, azimuth } = this.computeRelativeDirection(dx, dz, playerYaw);
    this.cantorAzimuth = azimuth;
    this.cantorOcclusionHz = occluded ? 380 : cantorState === 'CHASE' ? 2250 : 1050;

    if (cantorState !== this.lastCantorCaptionState && dist < 26) {
      this.lastCantorCaptionState = cantorState;
      if (cantorState === 'INVESTIGATE') {
        this.playToneBurst(880, 660, 0.18, 'triangle', 0.26, this.cantorSourcePos, occluded);
        this.emitThrottledCaption('cantor_inv', `[Metallic click-echo — Investigating ${dirLabel}]`, true, 1200);
      } else if (cantorState === 'CHASE') {
        this.playToneBurst(310, 820, 0.45, 'sawtooth', 0.42, this.cantorSourcePos, occluded);
        this.emitThrottledCaption('cantor_chase', `[The Cantor shrieks — Pursuing ${dirLabel}!]`, true, 1200);
      } else if (cantorState === 'COOLDOWN') {
        this.playToneBurst(420, 165, 0.48, 'triangle', 0.24, this.cantorSourcePos, occluded);
        this.emitThrottledCaption('cantor_cool', `[Descending resonator chord — Returning to patrol]`, false, 1500);
      }
    } else if (cantorState === 'PATROL' && dist < 21) {
      this.emitThrottledCaption('cantor_patrol', `[Resonant brace drag — ${dirLabel}, ${Math.round(dist)}m]`, false, 4800);
    }

    if (
      !this.ctx ||
      !this.cantorGain ||
      !this.cantorDroneOsc ||
      !this.cantorHarmonicOsc ||
      !this.cantorFilter ||
      !this.cantorPanner
    ) {
      return;
    }

    const t = this.ctx.currentTime;
    if (this.cantorPanner.positionX) {
      this.cantorPanner.positionX.setTargetAtTime(this.cantorSourcePos.x, t, 0.03);
      this.cantorPanner.positionY.setTargetAtTime(this.cantorSourcePos.y, t, 0.03);
      this.cantorPanner.positionZ.setTargetAtTime(this.cantorSourcePos.z, t, 0.03);
    } else {
      this.cantorPanner.setPosition(this.cantorSourcePos.x, this.cantorSourcePos.y, this.cantorSourcePos.z);
    }

    if (this.cantorStereoTrim) {
      this.cantorStereoTrim.pan.setTargetAtTime(Math.max(-1, Math.min(1, azimuth)), t, 0.04);
    }

    const stateBoost = cantorState === 'CHASE' ? 1.7 : cantorState === 'INVESTIGATE' ? 1.2 : 0.85;
    const baseLevel = dist > 26 ? 0.0001 : 0.34 * stateBoost * (occluded ? 0.55 : 1.0);
    this.cantorGain.gain.setTargetAtTime(baseLevel, t, 0.08);
    this.cantorFilter.frequency.setTargetAtTime(this.cantorOcclusionHz, t, 0.1);
    this.cantorDroneOsc.frequency.setTargetAtTime(cantorState === 'CHASE' ? 146 : 108, t, 0.15);
    this.cantorHarmonicOsc.frequency.setTargetAtTime(cantorState === 'CHASE' ? 218 : 162, t, 0.15);
  }

  public computeRelativeDirection(dx: number, dz: number, playerYaw: number): { dir: string; azimuth: number } {
    const forwardX = -Math.sin(playerYaw);
    const forwardZ = -Math.cos(playerYaw);
    const rightX = Math.cos(playerYaw);
    const rightZ = -Math.sin(playerYaw);
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;
    const fDot = nx * forwardX + nz * forwardZ;
    const rDot = nx * rightX + nz * rightZ;
    let dir = 'Ahead';
    if (fDot > 0.55) dir = 'Ahead';
    else if (fDot < -0.55) dir = 'Behind';
    else dir = rDot > 0 ? 'Right' : 'Left';
    return { dir, azimuth: Math.max(-1, Math.min(1, rDot)) };
  }

  private emitThrottledCaption(key: string, text: string, danger: boolean, cooldownMs: number): void {
    if (!this.settings.subtitlesAndCaptions) return;
    const now = performance.now();
    const prev = this.lastCaptionTimestamps.get(key) ?? 0;
    if (now - prev < cooldownMs) return;
    this.lastCaptionTimestamps.set(key, now);
    this.onCaption(text, danger);
  }

  private playToneBurst(
    fStart: number,
    fEnd: number,
    duration: number,
    type: OscillatorType,
    vol: number,
    worldPos?: Vec3,
    occluded = false
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fStart, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t + duration);
    g.gain.setValueAtTime(vol * (occluded ? 0.58 : 1.0), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g);

    if (worldPos) {
      this.lastSpatialSfxPos = { ...worldPos };
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = occluded ? 480 : 2800;

      const panner = this.ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2.0;
      panner.maxDistance = 32.0;
      panner.rolloffFactor = 1.1;
      if (panner.positionX) {
        panner.positionX.setValueAtTime(worldPos.x, t);
        panner.positionY.setValueAtTime(worldPos.y, t);
        panner.positionZ.setValueAtTime(worldPos.z, t);
      } else {
        panner.setPosition(worldPos.x, worldPos.y, worldPos.z);
      }

      g.connect(filter);
      filter.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      g.connect(this.sfxGain);
    }

    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  private setupAmbientChain(): void {
    if (!this.ctx || !this.ambienceGain) return;
    this.ambientFilter = this.ctx.createBiquadFilter();
    this.ambientFilter.type = 'lowpass';
    this.ambientFilter.frequency.value = 600;

    this.ambientOscA = this.ctx.createOscillator();
    this.ambientOscB = this.ctx.createOscillator();
    this.ambientOscA.type = 'sine';
    this.ambientOscB.type = 'triangle';
    this.ambientOscA.frequency.value = 55;
    this.ambientOscB.frequency.value = 82.5;

    const oscGain = this.ctx.createGain();
    oscGain.gain.value = 0.14;
    this.ambientOscA.connect(oscGain);
    this.ambientOscB.connect(oscGain);
    oscGain.connect(this.ambientFilter);

    const bufferSize = this.ctx.sampleRate * 2;
    this.sharedNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.sharedNoiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = ((i * 16807) % 2147483647) / 1073741824 - 1;
      data[i] = (lastOut + 0.03 * white) / 1.03;
      lastOut = data[i];
    }
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = this.sharedNoiseBuffer;
    noiseNode.loop = true;
    this.ambientNoiseGain = this.ctx.createGain();
    this.ambientNoiseGain.gain.value = 0.12;
    noiseNode.connect(this.ambientNoiseGain);
    this.ambientNoiseGain.connect(this.ambientFilter);

    this.ambientFilter.connect(this.ambienceGain);
    this.ambientOscA.start();
    this.ambientOscB.start();
    noiseNode.start();
  }

  private setupCantorSpatialChain(): void {
    if (!this.ctx || !this.sfxGain) return;
    this.cantorDroneOsc = this.ctx.createOscillator();
    this.cantorHarmonicOsc = this.ctx.createOscillator();
    this.cantorFilter = this.ctx.createBiquadFilter();
    this.cantorPanner = this.ctx.createPanner();
    this.cantorStereoTrim = this.ctx.createStereoPanner();
    this.cantorGain = this.ctx.createGain();

    this.cantorDroneOsc.type = 'sawtooth';
    this.cantorHarmonicOsc.type = 'triangle';
    this.cantorDroneOsc.frequency.value = 108;
    this.cantorHarmonicOsc.frequency.value = 162;

    this.cantorFilter.type = 'lowpass';
    this.cantorFilter.frequency.value = 950;

    this.cantorPanner.panningModel = 'HRTF';
    this.cantorPanner.distanceModel = 'inverse';
    this.cantorPanner.refDistance = 2.4;
    this.cantorPanner.maxDistance = 28.0;
    this.cantorPanner.rolloffFactor = 1.15;

    this.cantorGain.gain.value = 0.0001;

    this.cantorDroneOsc.connect(this.cantorFilter);
    this.cantorHarmonicOsc.connect(this.cantorFilter);
    this.cantorFilter.connect(this.cantorPanner);
    this.cantorPanner.connect(this.cantorStereoTrim);
    this.cantorStereoTrim.connect(this.cantorGain);
    this.cantorGain.connect(this.sfxGain);

    this.cantorDroneOsc.start();
    this.cantorHarmonicOsc.start();
  }

  private setupDosimeterChain(): void {
    if (!this.ctx || !this.sfxGain) return;
    this.dosimeterOsc = this.ctx.createOscillator();
    this.dosimeterGain = this.ctx.createGain();
    this.dosimeterOsc.type = 'sine';
    this.dosimeterOsc.frequency.value = 120;
    this.dosimeterGain.gain.value = 0.0001;
    this.dosimeterOsc.connect(this.dosimeterGain);
    this.dosimeterGain.connect(this.sfxGain);
    this.dosimeterOsc.start();
  }

  private setupPhysiologyChains(): void {
    if (!this.ctx || !this.sfxGain || !this.masterGain) return;

    // 1. Respiration synthesizer (airway dual-formant filtered noise routed through sfxGain)
    if (this.sharedNoiseBuffer) {
      const breathSrc = this.ctx.createBufferSource();
      breathSrc.buffer = this.sharedNoiseBuffer;
      breathSrc.loop = true;

      this.breathFormantA = this.ctx.createBiquadFilter();
      this.breathFormantA.type = 'bandpass';
      this.breathFormantA.frequency.value = 440;
      this.breathFormantA.Q.value = 2.6;

      this.breathFormantB = this.ctx.createBiquadFilter();
      this.breathFormantB.type = 'bandpass';
      this.breathFormantB.frequency.value = 1220;
      this.breathFormantB.Q.value = 3.2;

      this.breathGain = this.ctx.createGain();
      this.breathGain.gain.value = 0.0001;

      breathSrc.connect(this.breathFormantA);
      breathSrc.connect(this.breathFormantB);
      this.breathFormantA.connect(this.breathGain);
      this.breathFormantB.connect(this.breathGain);
      this.breathGain.connect(this.sfxGain);
      breathSrc.start();
    }

    // 2. Pulsing cardiac lub-dub synthesizer (routed through sfxGain -> injuryMuffleFilter -> masterGain)
    this.heartbeatOsc = this.ctx.createOscillator();
    this.heartbeatOsc.type = 'sine';
    this.heartbeatOsc.frequency.value = 52;

    const hbFilter = this.ctx.createBiquadFilter();
    hbFilter.type = 'lowpass';
    hbFilter.frequency.value = 135;

    this.heartbeatGain = this.ctx.createGain();
    this.heartbeatGain.gain.value = 0.0001;

    this.heartbeatOsc.connect(hbFilter);
    hbFilter.connect(this.heartbeatGain);
    this.heartbeatGain.connect(this.sfxGain);
    this.heartbeatOsc.start();
  }
}
