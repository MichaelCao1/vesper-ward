export class DeterministicRNG {
  private state: number;
  public readonly initialSeed: number;

  constructor(seed = 19281117) {
    this.initialSeed = seed >>> 0;
    this.state = this.initialSeed || 1;
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  public int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  public fork(salt: number): DeterministicRNG {
    return new DeterministicRNG((this.initialSeed ^ Math.imul(salt + 1, 2654435761)) >>> 0);
  }
}

export function resolveSeedFromURL(): { seed: number; qaEnabled: boolean } {
  try {
    const params = new URLSearchParams(window.location.search);
    const rawSeed = params.get('seed');
    const parsed = rawSeed !== null ? Number.parseInt(rawSeed, 10) : Number.NaN;
    const seed = Number.isFinite(parsed) ? parsed >>> 0 : 19281117;
    const qaEnabled = params.get('qa') === '1' || params.get('qa') === 'true';
    return { seed, qaEnabled };
  } catch {
    return { seed: 19281117, qaEnabled: false };
  }
}
