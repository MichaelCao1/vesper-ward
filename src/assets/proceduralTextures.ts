import * as THREE from 'three';
import { DeterministicRNG } from '../core/rng';

export class ProceduralMaterialLibrary {
  private materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private textureCache = new Map<string, THREE.CanvasTexture>();
  private rng: DeterministicRNG;

  constructor(seed = 19281117) {
    this.rng = new DeterministicRNG(seed);
  }

  public getTextureCount(): number {
    return this.textureCache.size;
  }

  public getAllTextures(): THREE.Texture[] {
    const set = new Set<THREE.Texture>(this.textureCache.values());
    for (const m of this.materialCache.values()) {
      if (m.map) set.add(m.map);
      if (m.roughnessMap) set.add(m.roughnessMap);
      if (m.bumpMap) set.add(m.bumpMap);
      if (m.emissiveMap) set.add(m.emissiveMap);
    }
    return Array.from(set);
  }

  public getMaterial(key: string, repeatX = 1, repeatY = 1): THREE.MeshStandardMaterial {
    const cacheKey = `${key}_${repeatX.toFixed(2)}_${repeatY.toFixed(2)}`;
    const existing = this.materialCache.get(cacheKey);
    if (existing) return existing;

    const mat = this.buildMaterial(key, repeatX, repeatY);
    this.materialCache.set(cacheKey, mat);
    return mat;
  }

  public makePlaqueTexture(title: string, subtitle: string, accent = '#7be0b8', bg = '#121c19'): THREE.CanvasTexture {
    const key = `plaque_${title}_${subtitle}_${accent}`;
    const existing = this.textureCache.get(key);
    if (existing) return existing;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 192);
    ctx.strokeStyle = '#b49250';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 496, 176);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, 476, 156);

    ctx.fillStyle = accent;
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(title, 256, 78);

    ctx.fillStyle = '#e5dec9';
    ctx.font = '20px Georgia, serif';
    ctx.fillText(subtitle, 256, 128);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textureCache.set(key, tex);
    return tex;
  }

  public makeCRTScreenTexture(variant: 'amber' | 'green'): THREE.CanvasTexture {
    const key = `crt_screen_${variant}`;
    const existing = this.textureCache.get(key);
    if (existing) return existing;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = variant === 'amber' ? '#1c1105' : '#081a12';
    ctx.fillRect(0, 0, 512, 384);

    const fg = variant === 'amber' ? '#f2a63b' : '#58e89c';
    const dim = variant === 'amber' ? 'rgba(242,166,59,0.28)' : 'rgba(88,232,156,0.25)';

    ctx.strokeStyle = dim;
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, 476, 348);

    ctx.fillStyle = fg;
    ctx.font = 'bold 20px monospace';
    ctx.fillText('ST. DAMIAN SUB-BASAL OS v3.4', 36, 56);
    ctx.font = '16px monospace';
    if (variant === 'amber') {
      ctx.fillText('>> TYMPANIC CONTAINMENT REGISTRY', 36, 94);
      ctx.fillText('SUBJ-04  KESTREL, M.   [DISCHARGED]', 36, 136);
      ctx.fillText('SUBJ-09  VANE, J.      [ACTIVE - B2/B3]', 36, 170);
      ctx.fillText('CRYO VAULT: C-04   //  CHUTE LOCK: 318', 36, 204);
      ctx.fillText('RESONANCE BUS: 120 kW  [ENERGIZED]', 36, 252);
    } else {
      ctx.fillText('>> ACOUSTIC TELEMETRY MONITOR', 36, 94);
      ctx.beginPath();
      for (let x = 36; x < 470; x += 4) {
        const y = 195 + Math.sin(x * 0.055) * 42 * Math.cos(x * 0.015);
        if (x === 36) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = fg;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillText('BAFFLE EMITTERS: SAFE HAVEN SEALED', 36, 310);
    }

    // Subtle CRT phosphor scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 0; y < 384; y += 4) {
      ctx.fillRect(0, y, 512, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textureCache.set(key, tex);
    return tex;
  }

  public makeLuxDialTexture(): THREE.CanvasTexture {
    const key = 'lux_dial_face_v2';
    const existing = this.textureCache.get(key);
    if (existing) return existing;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(128, 148, 12, 128, 128, 122);
    grad.addColorStop(0, '#162922');
    grad.addColorStop(1, '#0a120f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#c8a660';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.stroke();

    // Scale arc & tick marks
    ctx.strokeStyle = '#7bf0be';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(128, 156, 86, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (1.15 + (i / 10) * 0.7);
      const r0 = i % 5 === 0 ? 70 : 77;
      const r1 = 88;
      ctx.strokeStyle = i >= 8 ? '#e05248' : '#9ef2cc';
      ctx.lineWidth = i % 5 === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * r0, 156 + Math.sin(a) * r0);
      ctx.lineTo(128 + Math.cos(a) * r1, 156 + Math.sin(a) * r1);
      ctx.stroke();
    }

    ctx.fillStyle = '#d4b26a';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HARMONIC mG', 128, 118);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#8adbc0';
    ctx.fillText('ST. DAMIAN LUX-09', 128, 206);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textureCache.set(key, tex);
    return tex;
  }

  public makeEngravedBrassTexture(lines: string[]): THREE.CanvasTexture {
    const key = `engraved_${lines.join('|')}`;
    const existing = this.textureCache.get(key);
    if (existing) return existing;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(256, 240, 24, 256, 256, 248);
    grad.addColorStop(0, '#ebd08e');
    grad.addColorStop(0.7, '#be9a50');
    grad.addColorStop(1, '#6e5424');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    const localRng = this.rng.fork(77);
    ctx.strokeStyle = 'rgba(48,34,12,0.22)';
    for (let i = 0; i < 85; i++) {
      ctx.beginPath();
      const x = localRng.range(44, 468);
      const y = localRng.range(44, 468);
      ctx.moveTo(x, y);
      ctx.lineTo(x + localRng.range(-38, 38), y + localRng.range(-38, 38));
      ctx.stroke();
    }

    ctx.strokeStyle = '#3a290c';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(256, 256, 220, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,244,206,0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(256, 256, 211, 0, Math.PI * 2);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = 'bold 31px Georgia, serif';
    const startY = 256 - ((lines.length - 1) * 50) / 2 + 10;
    lines.forEach((line, idx) => {
      const ly = startY + idx * 50;
      ctx.fillStyle = 'rgba(255,246,214,0.68)';
      ctx.fillText(line, 257.5, ly + 1.8);
      ctx.fillStyle = '#140d03';
      ctx.fillText(line, 256, ly);
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textureCache.set(key, tex);
    return tex;
  }

  public makeXRayTexture(bedLabel: string, clampCode?: string): THREE.CanvasTexture {
    const key = `xray_${bedLabel}_${clampCode ?? 'none'}`;
    const existing = this.textureCache.get(key);
    if (existing) return existing;

    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0a1820';
    ctx.fillRect(0, 0, 384, 512);

    const glow = ctx.createRadialGradient(192, 240, 20, 192, 240, 220);
    glow.addColorStop(0, 'rgba(155, 225, 240, 0.35)');
    glow.addColorStop(1, 'rgba(10, 28, 38, 0.95)');
    ctx.fillStyle = glow;
    ctx.fillRect(16, 16, 352, 480);

    ctx.strokeStyle = 'rgba(208, 242, 248, 0.72)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(192, 70);
    ctx.lineTo(192, 405);
    ctx.stroke();

    ctx.lineWidth = 6;
    for (let r = 0; r < 7; r++) {
      const y = 105 + r * 36;
      const span = 118 - Math.abs(r - 3) * 11;
      ctx.beginPath();
      ctx.ellipse(192 - span * 0.52, y + 10, span * 0.52, 18, -0.18, 0.2, Math.PI - 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(192 + span * 0.52, y + 10, span * 0.52, 18, 0.18, 0.15, Math.PI - 0.2);
      ctx.stroke();
    }

    if (clampCode) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(222, 195);
      ctx.lineTo(268, 232);
      ctx.moveTo(232, 188);
      ctx.lineTo(258, 240);
      ctx.stroke();

      ctx.fillStyle = '#ffdf8e';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(`CLAMP #${clampCode}`, 248, 272);
    }

    ctx.fillStyle = '#bfeaf2';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(bedLabel, 28, 474);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textureCache.set(key, tex);
    return tex;
  }

  private buildMaterial(key: string, rx: number, ry: number): THREE.MeshStandardMaterial {
    switch (key) {
      case 'terrazzo_wet': {
        const { colorTex, roughTex } = this.buildTerrazzoPair(rx, ry);
        return new THREE.MeshStandardMaterial({
          map: colorTex,
          roughnessMap: roughTex,
          bumpMap: colorTex,
          bumpScale: 0.012,
          roughness: 0.68,
          metalness: 0.1,
        });
      }
      case 'celadon_wainscot': {
        // High-res 512x512 smooth plaster + molded chair rail + fluted celadon wainscot + baseboard
        const tex = this.getCachedPattern('celadon_wainscot_hd', 512, 512, rx, ry, (ctx, rng) => {
          const upperGrad = ctx.createLinearGradient(0, 0, 0, 268);
          upperGrad.addColorStop(0, '#858273');
          upperGrad.addColorStop(0.85, '#9d9886');
          upperGrad.addColorStop(1, '#7c7868');
          ctx.fillStyle = upperGrad;
          ctx.fillRect(0, 0, 512, 268);

          // Crown cornice & molded chair rail
          ctx.fillStyle = '#5f5b4d';
          ctx.fillRect(0, 0, 512, 14);
          ctx.fillStyle = '#334840';
          ctx.fillRect(0, 264, 512, 18);
          ctx.fillStyle = '#8f7948';
          ctx.fillRect(0, 268, 512, 4);

          const lowerGrad = ctx.createLinearGradient(0, 282, 0, 512);
          lowerGrad.addColorStop(0, '#496b61');
          lowerGrad.addColorStop(0.82, '#38544c');
          lowerGrad.addColorStop(1, '#23332e');
          ctx.fillStyle = lowerGrad;
          ctx.fillRect(0, 282, 512, 230);

          // Recessed wainscot stile panels instead of noisy blocks
          ctx.strokeStyle = 'rgba(20, 32, 28, 0.55)';
          ctx.lineWidth = 4;
          for (let px = 16; px < 512; px += 128) {
            ctx.strokeRect(px, 298, 96, 178);
          }
          // Dark baseboard
          ctx.fillStyle = '#1e2825';
          ctx.fillRect(0, 488, 512, 24);

          // Subtle organic vertical dampness streaks & fine grain
          for (let i = 0; i < 65; i++) {
            const sx = rng.range(0, 512);
            const sy = rng.range(0, 460);
            const sh = rng.range(35, 130);
            const g = ctx.createLinearGradient(sx, sy, sx, sy + sh);
            g.addColorStop(0, 'rgba(30, 42, 38, 0.0)');
            g.addColorStop(0.5, 'rgba(26, 38, 34, 0.14)');
            g.addColorStop(1, 'rgba(30, 42, 38, 0.0)');
            ctx.fillStyle = g;
            ctx.fillRect(sx, sy, rng.range(6, 22), sh);
          }
          for (let i = 0; i < 900; i++) {
            ctx.fillStyle = rng.next() > 0.5 ? 'rgba(255,250,235,0.05)' : 'rgba(15,20,18,0.06)';
            ctx.fillRect(rng.range(0, 512), rng.range(0, 512), 2, 2);
          }
        });
        return new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.016, roughness: 0.72, metalness: 0.05 });
      }
      case 'surgical_tile': {
        const tex = this.getCachedPattern('surgical_tile_hd', 512, 512, rx, ry, (ctx, rng) => {
          ctx.fillStyle = '#8b9d98';
          ctx.fillRect(0, 0, 512, 512);
          for (let ty = 0; ty < 8; ty++) {
            for (let tx = 0; tx < 8; tx++) {
              const v = Math.floor(rng.range(-7, 7));
              ctx.fillStyle = `rgb(${134 + v}, ${152 + v}, ${147 + v})`;
              ctx.fillRect(tx * 64 + 2, ty * 64 + 2, 60, 60);
            }
          }
          ctx.strokeStyle = '#4d5d58';
          ctx.lineWidth = 2;
          for (let i = 0; i <= 512; i += 64) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, 512);
            ctx.moveTo(0, i);
            ctx.lineTo(512, i);
            ctx.stroke();
          }
        });
        return new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.012, roughness: 0.32, metalness: 0.08 });
      }
      case 'walnut_panel': {
        const tex = this.getCachedPattern('walnut_panel_hd', 512, 512, rx, ry, (ctx, rng) => {
          ctx.fillStyle = '#4a3121';
          ctx.fillRect(0, 0, 512, 512);
          for (let y = 0; y < 512; y += 2) {
            ctx.fillStyle = rng.next() > 0.5 ? 'rgba(26,14,8,0.22)' : 'rgba(105,72,46,0.15)';
            ctx.fillRect(0, y, 512, 2);
          }
          ctx.strokeStyle = '#25160d';
          ctx.lineWidth = 8;
          ctx.strokeRect(22, 22, 212, 468);
          ctx.strokeRect(278, 22, 212, 468);
          ctx.strokeStyle = '#755338';
          ctx.lineWidth = 2;
          ctx.strokeRect(30, 30, 196, 452);
          ctx.strokeRect(286, 30, 196, 452);
        });
        return new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.016, roughness: 0.46, metalness: 0.08 });
      }
      case 'brutalist_concrete': {
        const tex = this.getCachedPattern('brutalist_concrete_hd', 512, 512, rx, ry, (ctx, rng) => {
          ctx.fillStyle = '#63655f';
          ctx.fillRect(0, 0, 512, 512);
          // Board-formed horizontal planks with subtle tonal variation
          for (let row = 0; row < 8; row++) {
            const shade = Math.floor(rng.range(90, 108));
            ctx.fillStyle = `rgb(${shade}, ${shade + 1}, ${shade - 3})`;
            ctx.fillRect(0, row * 64, 512, 62);
            ctx.fillStyle = '#3d3f3b';
            ctx.fillRect(0, row * 64 + 62, 512, 2);
          }
          // Fine aggregate speckles
          for (let i = 0; i < 1200; i++) {
            ctx.fillStyle = rng.next() > 0.5 ? 'rgba(30,32,29,0.14)' : 'rgba(165,166,158,0.11)';
            ctx.fillRect(rng.range(0, 512), rng.range(0, 512), 2, 2);
          }
          // Formwork tie-rod recesses
          for (const x of [128, 384]) {
            for (const y of [96, 224, 352, 480]) {
              ctx.fillStyle = '#262825';
              ctx.beginPath();
              ctx.arc(x, y, 6, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#7e8078';
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
          }
        });
        return new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.024, roughness: 0.82, metalness: 0.06 });
      }
      case 'anechoic_wedge': {
        const tex = this.getCachedPattern('anechoic_wedge_hd', 512, 512, rx, ry, (ctx) => {
          ctx.fillStyle = '#252a2e';
          ctx.fillRect(0, 0, 512, 512);
          for (let y = 0; y < 512; y += 64) {
            for (let x = 0; x < 512; x += 64) {
              const alt = ((x + y) / 64) % 2 === 0;
              ctx.fillStyle = alt ? '#363d44' : '#1c2024';
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + 64, y);
              ctx.lineTo(x + 32, y + 32);
              ctx.closePath();
              ctx.fill();

              ctx.fillStyle = alt ? '#1f2428' : '#3d454d';
              ctx.beginPath();
              ctx.moveTo(x, y + 64);
              ctx.lineTo(x + 64, y + 64);
              ctx.lineTo(x + 32, y + 32);
              ctx.closePath();
              ctx.fill();
            }
          }
        });
        return new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.05, roughness: 0.88, metalness: 0.08 });
      }
      case 'culvert_brick': {
        const tex = this.getCachedPattern('culvert_brick_hd', 512, 512, rx, ry, (ctx, rng) => {
          ctx.fillStyle = '#3a2c27';
          ctx.fillRect(0, 0, 512, 512);
          for (let row = 0; row < 16; row++) {
            const y = row * 32;
            const offset = (row % 2) * 32;
            for (let col = -1; col < 9; col++) {
              const x = col * 64 + offset;
              const shade = Math.floor(rng.range(78, 118));
              ctx.fillStyle = `rgb(${shade}, ${Math.floor(shade * 0.63)}, ${Math.floor(shade * 0.53)})`;
              ctx.fillRect(x + 2, y + 2, 60, 28);
            }
          }
          const damp = ctx.createLinearGradient(0, 340, 0, 512);
          damp.addColorStop(0, 'rgba(32, 54, 42, 0)');
          damp.addColorStop(1, 'rgba(26, 48, 36, 0.42)');
          ctx.fillStyle = damp;
          ctx.fillRect(0, 340, 512, 172);
        });
        return new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.03, roughness: 0.74, metalness: 0.06 });
      }
      case 'tarnished_brass':
        return new THREE.MeshStandardMaterial({
          color: 0xc29e58,
          roughness: 0.28,
          metalness: 0.86,
        });
      case 'copper_bus':
        return new THREE.MeshStandardMaterial({
          color: 0xc87343,
          roughness: 0.26,
          metalness: 0.88,
        });
      case 'dark_iron':
        return new THREE.MeshStandardMaterial({
          color: 0x32393c,
          roughness: 0.42,
          metalness: 0.78,
        });
      case 'frosted_glass':
        return new THREE.MeshStandardMaterial({
          color: 0xa4c8c4,
          roughness: 0.2,
          metalness: 0.12,
          transparent: true,
          opacity: 0.5,
        });
      case 'conduit_yellow':
        return new THREE.MeshStandardMaterial({
          color: 0xdba935,
          emissive: 0x332204,
          roughness: 0.36,
          metalness: 0.58,
        });
      case 'steam_pipe_red':
        return new THREE.MeshStandardMaterial({
          color: 0xa83a30,
          roughness: 0.48,
          metalness: 0.5,
        });
      case 'oil_water': {
        const tex = this.getCachedPattern('oil_water_hd', 512, 512, rx, ry, (ctx, rng) => {
          ctx.fillStyle = '#132830';
          ctx.fillRect(0, 0, 512, 512);
          for (let i = 0; i < 110; i++) {
            ctx.strokeStyle = i % 2 === 0 ? 'rgba(82, 175, 198, 0.28)' : 'rgba(155, 112, 162, 0.18)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(rng.range(0, 512), rng.range(0, 512), rng.range(12, 56), 0, Math.PI * 2);
            ctx.stroke();
          }
        });
        return new THREE.MeshStandardMaterial({
          map: tex,
          bumpMap: tex,
          bumpScale: 0.015,
          color: 0x234852,
          roughness: 0.08,
          metalness: 0.78,
          transparent: true,
          opacity: 0.88,
        });
      }
      case 'steel_grate': {
        const tex = this.getCachedPattern('steel_grate_hd', 256, 256, rx, ry, (ctx) => {
          ctx.fillStyle = '#2b3336';
          ctx.fillRect(0, 0, 256, 256);
          ctx.strokeStyle = '#627176';
          ctx.lineWidth = 4;
          for (let i = 0; i <= 256; i += 32) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, 256);
            ctx.moveTo(0, i);
            ctx.lineTo(256, i);
            ctx.stroke();
          }
        });
        return new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.02, roughness: 0.36, metalness: 0.8 });
      }
      case 'porcelain_white':
        return new THREE.MeshStandardMaterial({
          color: 0xd0d5cd,
          roughness: 0.22,
          metalness: 0.08,
        });
      case 'surgical_cloth':
        return new THREE.MeshStandardMaterial({
          color: 0x4b7368,
          roughness: 0.82,
          metalness: 0.04,
          side: THREE.DoubleSide,
        });
      case 'crt_phosphor': {
        const screen = this.makeCRTScreenTexture('green');
        return new THREE.MeshStandardMaterial({
          map: screen,
          emissiveMap: screen,
          emissive: 0xffffff,
          emissiveIntensity: 0.92,
          roughness: 0.18,
          metalness: 0.12,
        });
      }
      case 'amber_crt': {
        const screen = this.makeCRTScreenTexture('amber');
        return new THREE.MeshStandardMaterial({
          map: screen,
          emissiveMap: screen,
          emissive: 0xffffff,
          emissiveIntensity: 0.95,
          roughness: 0.18,
          metalness: 0.12,
        });
      }
      default:
        return new THREE.MeshStandardMaterial({ color: 0x5c6460, roughness: 0.75, metalness: 0.1 });
    }
  }

  private buildTerrazzoPair(rx: number, ry: number): {
    colorTex: THREE.CanvasTexture;
    roughTex: THREE.CanvasTexture;
  } {
    const key = `terrazzo_pair_hd_${rx}_${ry}`;
    const existingColor = this.textureCache.get(`${key}_c`);
    const existingRough = this.textureCache.get(`${key}_r`);
    if (existingColor && existingRough) {
      return { colorTex: existingColor, roughTex: existingRough };
    }

    const cCanvas = document.createElement('canvas');
    cCanvas.width = 512;
    cCanvas.height = 512;
    const cCtx = cCanvas.getContext('2d')!;

    const rCanvas = document.createElement('canvas');
    rCanvas.width = 512;
    rCanvas.height = 512;
    const rCtx = rCanvas.getContext('2d')!;

    for (let ty = 0; ty < 4; ty++) {
      for (let tx = 0; tx < 4; tx++) {
        const dark = (tx + ty) % 2 === 0;
        cCtx.fillStyle = dark ? '#354540' : '#949080';
        cCtx.fillRect(tx * 128, ty * 128, 128, 128);
        cCtx.strokeStyle = '#7e693d';
        cCtx.lineWidth = 2;
        cCtx.strokeRect(tx * 128, ty * 128, 128, 128);
      }
    }

    const localRng = this.rng.fork(101);
    // Fine marble aggregate chips (2..4px)
    for (let i = 0; i < 950; i++) {
      cCtx.fillStyle = localRng.next() > 0.5 ? 'rgba(225,220,205,0.28)' : 'rgba(22,30,28,0.28)';
      cCtx.fillRect(localRng.range(0, 512), localRng.range(0, 512), localRng.range(2, 4), localRng.range(2, 4));
    }

    rCtx.fillStyle = 'rgb(172,172,172)';
    rCtx.fillRect(0, 0, 512, 512);
    for (let p = 0; p < 5; p++) {
      const px = localRng.range(64, 448);
      const py = localRng.range(64, 448);
      const rad = localRng.range(48, 105);
      const g = rCtx.createRadialGradient(px, py, 8, px, py, rad);
      g.addColorStop(0, 'rgb(14,14,14)');
      g.addColorStop(0.78, 'rgb(28,28,28)');
      g.addColorStop(1, 'rgb(172,172,172)');
      rCtx.fillStyle = g;
      rCtx.beginPath();
      rCtx.arc(px, py, rad, 0, Math.PI * 2);
      rCtx.fill();

      cCtx.fillStyle = 'rgba(18, 30, 30, 0.22)';
      cCtx.beginPath();
      cCtx.arc(px, py, rad * 0.9, 0, Math.PI * 2);
      cCtx.fill();
    }

    const colorTex = new THREE.CanvasTexture(cCanvas);
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.wrapS = THREE.RepeatWrapping;
    colorTex.wrapT = THREE.RepeatWrapping;
    colorTex.repeat.set(rx, ry);
    colorTex.anisotropy = 4;

    const roughTex = new THREE.CanvasTexture(rCanvas);
    roughTex.wrapS = THREE.RepeatWrapping;
    roughTex.wrapT = THREE.RepeatWrapping;
    roughTex.repeat.set(rx, ry);
    roughTex.anisotropy = 4;

    this.textureCache.set(`${key}_c`, colorTex);
    this.textureCache.set(`${key}_r`, roughTex);
    return { colorTex, roughTex };
  }

  private getCachedPattern(
    baseKey: string,
    w: number,
    h: number,
    rx: number,
    ry: number,
    draw: (ctx: CanvasRenderingContext2D, rng: DeterministicRNG) => void
  ): THREE.CanvasTexture {
    const fullKey = `${baseKey}_${rx.toFixed(2)}_${ry.toFixed(2)}`;
    const existing = this.textureCache.get(fullKey);
    if (existing) return existing;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    draw(ctx, this.rng.fork(baseKey.length * 31));

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    tex.anisotropy = 4;
    this.textureCache.set(fullKey, tex);
    return tex;
  }
}
