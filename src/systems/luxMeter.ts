import * as THREE from 'three';
import { AABB, LampMode, Vec3 } from '../core/types';
import { ProceduralMaterialLibrary } from '../assets/proceduralTextures';

export class LuxMeterSystem {
  public acquired = false;
  public mode: LampMode = 0; // 0 = Off, 1 = Tungsten, 2 = Ruby
  public charge = 88;
  public calibrated = false;
  public isCranking = false;
  public needleReading = 0.08;
  public lastBeamHit: Vec3 | null = null;

  private spotLight: THREE.SpotLight;
  private spotTarget: THREE.Object3D;
  private closeFill: THREE.PointLight;
  private instrumentLight: THREE.PointLight;
  public readonly viewModel: THREE.Group;
  private crankPivot: THREE.Group;
  private needlePivot: THREE.Group;
  private jewelMat: THREE.MeshStandardMaterial;
  private crankClickAccum = 0;
  private beamCheckAccum = 0;

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene, mats: ProceduralMaterialLibrary) {
    this.spotLight = new THREE.SpotLight(0xfff0d4, 0, 26, Math.PI * 0.23, 0.45, 1.25);
    this.spotLight.castShadow = false;
    this.spotTarget = new THREE.Object3D();
    this.spotLight.target = this.spotTarget;

    this.closeFill = new THREE.PointLight(0xfff0d4, 0, 6.8, 1.4);
    // Dedicated low-intensity instrument fill so the handheld casing & markings read cleanly without overexposing!
    this.instrumentLight = new THREE.PointLight(0xffe6bd, 0.26, 0.48, 1.5);

    this.viewModel = new THREE.Group();
    const walnut = mats.getMaterial('walnut_panel');
    const dialTex = mats.makeLuxDialTexture();

    // Bespoke non-glare gunmetal bakelite & aged satin brass materials (R4-ART-01 fix)
    const bakeliteBodyMat = new THREE.MeshStandardMaterial({
      color: 0x1b2120,
      roughness: 0.72,
      metalness: 0.22,
    });
    const agedBrassMat = new THREE.MeshStandardMaterial({
      color: 0x8a6d36,
      roughness: 0.52,
      metalness: 0.42,
    });

    // Main chamfered dark-bakelite body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.102, 0.132), bakeliteBodyMat);
    this.viewModel.add(body);

    // Satin aged-brass rear bezel plate
    const rearFrame = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.108, 0.012), agedBrassMat);
    rearFrame.position.z = 0.063;
    this.viewModel.add(rearFrame);

    // 4 Corner brass instrument screws on viewer-facing plate
    for (const [sx, sy] of [
      [-0.036, 0.041],
      [0.036, 0.041],
      [-0.036, -0.041],
      [0.036, -0.041],
    ]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.007, 8), agedBrassMat);
      screw.rotation.x = Math.PI / 2;
      screw.position.set(sx, sy, 0.07);
      this.viewModel.add(screw);
    }

    // Viewer-facing Brass Bezel + Balanced Phosphor Analog Dial (+Z toward camera)
    const dialBezel = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.0048, 12, 28), agedBrassMat);
    dialBezel.position.set(0, -0.004, 0.071);
    this.viewModel.add(dialBezel);

    const dialFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.032, 28),
      new THREE.MeshStandardMaterial({
        map: dialTex,
        emissiveMap: dialTex,
        emissive: 0xd8ffe8,
        emissiveIntensity: 0.36,
        roughness: 0.35,
        metalness: 0.08,
      })
    );
    dialFace.position.set(0, -0.004, 0.072);
    this.viewModel.add(dialFace);

    // Live 3D Phosphor Needle inside viewer-facing dial
    this.needlePivot = new THREE.Group();
    this.needlePivot.position.set(0, -0.019, 0.074);
    const needle = new THREE.Mesh(
      new THREE.BoxGeometry(0.0024, 0.03, 0.002),
      new THREE.MeshBasicMaterial({ color: 0x7ef5b8 })
    );
    needle.position.y = 0.014;
    this.needlePivot.add(needle);
    this.viewModel.add(this.needlePivot);

    // Top Spectrum Selector Turret + Mode Indicator Jewel
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.02, 14), agedBrassMat);
    turret.position.set(0, 0.06, 0.014);
    this.viewModel.add(turret);

    this.jewelMat = new THREE.MeshStandardMaterial({
      color: 0xd9a85b,
      emissive: 0xc98a2e,
      emissiveIntensity: 0.65,
      roughness: 0.28,
    });
    const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.0068, 10, 10), this.jewelMat);
    jewel.position.set(0, 0.064, 0.031);
    this.viewModel.add(jewel);

    // Front Projector Lens Hood (-Z facing into world)
    const frontBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.052, 20), agedBrassMat);
    frontBarrel.rotation.x = Math.PI / 2;
    frontBarrel.position.set(0, 0.008, -0.088);
    this.viewModel.add(frontBarrel);

    // Side Folding Hand-Dynamo Crank + Walnut Knob
    this.crankPivot = new THREE.Group();
    this.crankPivot.position.set(-0.05, -0.008, 0.014);
    const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.05, 0.011), agedBrassMat);
    crankArm.position.y = 0.019;
    this.crankPivot.add(crankArm);
    const crankKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.022, 10), walnut);
    crankKnob.rotation.z = Math.PI / 2;
    crankKnob.position.set(-0.013, 0.04, 0);
    this.crankPivot.add(crankKnob);
    this.viewModel.add(this.crankPivot);

    // Ergonomic lower handle grip
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.074, 12), walnut);
    grip.position.set(0, -0.08, 0.01);
    grip.rotation.x = 0.18;
    this.viewModel.add(grip);

    // R4-ART-01 fix: Positioned cleanly to the LEFT of the bottom-right HUD instrument card so dial/needle/crank are 100% visible!
    this.viewModel.position.set(0.092, -0.182, -0.39);
    this.viewModel.rotation.set(0.15, -0.28, 0.02);

    camera.add(this.spotLight);
    camera.add(this.closeFill);
    camera.add(this.instrumentLight);
    camera.add(this.spotTarget);
    camera.add(this.viewModel);

    // Place world-projecting lamp origins IN FRONT of the lens barrel (-0.50m) so they illuminate the room ahead without blowing out the handheld casing!
    this.spotLight.position.set(0.07, -0.09, -0.5);
    this.closeFill.position.set(0.02, -0.05, -0.54);
    this.instrumentLight.position.set(0.06, -0.11, -0.22);
    this.spotTarget.position.set(0, -0.03, -8.5);

    if (!camera.parent) {
      scene.add(camera);
    }
  }

  public cycleMode(): LampMode {
    if (!this.acquired) return 0;
    this.mode = ((this.mode + 1) % 3) as LampMode;
    if (this.charge <= 0.5 && this.mode !== 0) {
      this.mode = 0;
    }
    return this.mode;
  }

  public useCapacitorCell(): boolean {
    if (!this.acquired || this.charge >= 99.5) return false;
    this.charge = 100;
    return true;
  }

  public update(
    dt: number,
    elapsed: number,
    crankHeld: boolean,
    reduceFlashing: boolean,
    cameraPos: Vec3,
    cameraForward: Vec3,
    playerPos: Vec3,
    cantorActive: boolean,
    cantorPos: Vec3,
    colliders: AABB[],
    conduitPoints: Vec3[],
    onDynamoClick: () => void,
    onTungstenSpotNearCantor: (hitPoint: Vec3) => void
  ): void {
    this.viewModel.visible = this.acquired;
    if (!this.acquired) {
      this.instrumentLight.intensity = 0;
      this.spotLight.intensity = 0;
      this.closeFill.intensity = 0;
      this.isCranking = false;
      this.needleReading = 0;
      this.lastBeamHit = null;
      return;
    }
    this.instrumentLight.intensity = 0.26;

    this.isCranking = crankHeld && this.charge < 100;
    if (crankHeld) {
      this.charge = Math.min(100, this.charge + dt * 24);
      this.crankPivot.rotation.x += dt * 16;
      this.crankClickAccum += dt;
      if (this.crankClickAccum >= 0.42) {
        this.crankClickAccum = 0;
        onDynamoClick();
      }
    } else {
      this.crankClickAccum = 0.25;
    }

    const eff = this.calibrated ? 0.65 : 1.0;
    if (this.mode === 1) {
      this.charge = Math.max(0, this.charge - dt * 1.25 * eff);
    } else if (this.mode === 2) {
      this.charge = Math.max(0, this.charge - dt * 0.32 * eff);
    }
    if (this.charge <= 0.05 && this.mode !== 0) {
      this.mode = 0;
    }

    const lowFlicker =
      this.charge < 12 ? (reduceFlashing ? 0.84 : 0.72 + 0.28 * Math.sin(elapsed * 18)) : 1.0;

    if (this.mode === 1) {
      this.spotLight.color.setHex(0xfff0d2);
      this.spotLight.distance = this.calibrated ? 30 : 25;
      this.spotLight.angle = Math.PI * 0.24;
      this.spotLight.intensity = 8.4 * lowFlicker;

      this.closeFill.color.setHex(0xffebd0);
      this.closeFill.distance = 6.8;
      this.closeFill.intensity = 1.6 * lowFlicker;

      this.jewelMat.color.setHex(0xf2ca7e);
      this.jewelMat.emissive.setHex(0xd49438);
      this.jewelMat.emissiveIntensity = 0.72;

      this.beamCheckAccum += dt;
      if (this.beamCheckAccum >= 0.15) {
        this.beamCheckAccum = 0;
        const hit = this.castBeamHit(cameraPos, cameraForward, this.spotLight.distance * 0.85, colliders);
        this.lastBeamHit = hit;
        if (cantorActive && hit) {
          const distToCantor = Math.hypot(
            hit.x - cantorPos.x,
            (hit.y - (cantorPos.y + 1.2)) * 1.2,
            hit.z - cantorPos.z
          );
          if (distToCantor < 7.2) {
            onTungstenSpotNearCantor(hit);
          }
        }
      }
    } else if (this.mode === 2) {
      this.lastBeamHit = null;
      this.spotLight.color.setHex(0xd62828);
      this.spotLight.distance = 12.5;
      this.spotLight.angle = Math.PI * 0.3;
      this.spotLight.intensity = 3.8 * lowFlicker;

      this.closeFill.color.setHex(0xc42525);
      this.closeFill.distance = 5.4;
      this.closeFill.intensity = 1.25 * lowFlicker;

      this.jewelMat.color.setHex(0xe84848);
      this.jewelMat.emissive.setHex(0xc42424);
      this.jewelMat.emissiveIntensity = 0.78;
    } else {
      this.lastBeamHit = null;
      this.spotLight.intensity = 0;
      this.closeFill.color.setHex(0x58827e);
      this.closeFill.distance = 3.6;
      this.closeFill.intensity = 0.28;

      this.jewelMat.color.setHex(0x3e5e58);
      this.jewelMat.emissive.setHex(0x23423c);
      this.jewelMat.emissiveIntensity = 0.35;
    }

    let signal = 0.06;
    const conduitRange = this.calibrated ? 10.5 : 6.5;
    for (const cp of conduitPoints) {
      const d = Math.hypot(playerPos.x - cp.x, playerPos.y - cp.y, playerPos.z - cp.z);
      if (d < conduitRange) {
        signal = Math.max(signal, (1 - d / conduitRange) * 0.88);
      }
    }
    if (cantorActive) {
      const cd = Math.hypot(playerPos.x - cantorPos.x, (playerPos.y - cantorPos.y) * 1.4, playerPos.z - cantorPos.z);
      if (cd < 22) {
        signal = Math.max(signal, 1 - cd / 22);
      }
    }
    const flutter = signal > 0.25 ? Math.sin(elapsed * 29) * 0.07 * signal : Math.sin(elapsed * 3.5) * 0.015;
    this.needleReading = Math.max(0.02, Math.min(1.0, signal + flutter));

    this.needlePivot.rotation.z = 0.68 - this.needleReading * 1.36;
  }

  public castBeamHit(origin: Vec3, dir: Vec3, maxDist: number, colliders: AABB[]): Vec3 | null {
    let bestT = maxDist;
    let hitAny = false;
    const ex = origin.x + dir.x * maxDist;
    const ey = origin.y + dir.y * maxDist;
    const ez = origin.z + dir.z * maxDist;
    const dx = ex - origin.x;
    const dy = ey - origin.y;
    const dz = ez - origin.z;

    for (const box of colliders) {
      let tmin = 0;
      let tmax = 1;
      const axes: Array<[number, number, number, number]> = [
        [origin.x, dx, box.minX, box.maxX],
        [origin.y, dy, box.minY, box.maxY],
        [origin.z, dz, box.minZ, box.maxZ],
      ];
      let valid = true;
      for (const [o, d, minB, maxB] of axes) {
        if (Math.abs(d) < 1e-6) {
          if (o < minB || o > maxB) {
            valid = false;
            break;
          }
        } else {
          let t1 = (minB - o) / d;
          let t2 = (maxB - o) / d;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
          }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) {
            valid = false;
            break;
          }
        }
      }
      if (valid && tmin > 0.01 && tmin * maxDist < bestT) {
        bestT = tmin * maxDist;
        hitAny = true;
      }
    }

    if (!hitAny) return null;
    return {
      x: origin.x + dir.x * bestT,
      y: origin.y + dir.y * bestT,
      z: origin.z + dir.z * bestT,
    };
  }
}
