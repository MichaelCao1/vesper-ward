import * as THREE from 'three';
import {
  AABB,
  DoorDef,
  FloorId,
  HidingSpotDef,
  InteractableDef,
  RoomDef,
  Vec3,
} from '../core/types';
import {
  BROKEN_GLASS_PATCHES,
  DOORS,
  FLOOR_ELEVATIONS,
  HIDING_SPOTS,
  INTERACTABLES,
  ROOMS,
  STAIR_RAMPS,
} from './worldData';
import { ProceduralMaterialLibrary } from '../assets/proceduralTextures';

export interface DoorRuntime {
  def: DoorDef;
  pivot: THREE.Group;
  leafMesh: THREE.Mesh;
  isOpen: boolean;
  isUnlocked: boolean;
  openProgress: number;
  bashShake: number;
  collider: AABB;
}

export interface InteractableRuntime {
  def: InteractableDef;
  mesh: THREE.Object3D;
  collected: boolean;
  highlightMats: THREE.MeshStandardMaterial[];
}

export interface VirtualZoneLight {
  x: number;
  y: number;
  z: number;
  color: number;
  baseIntensity: number;
  distance: number;
  decay: number;
  floor: FloorId;
  roomId: string;
  isStrobe?: boolean;
  isElevatorCab?: boolean;
  castsShadowAnchor?: boolean;
}

interface PortalCutout {
  wall: 'north' | 'south' | 'west' | 'east';
  center: number;
  width: number;
  bottomY: number;
  topY: number;
  isWindow?: boolean;
}

const POINT_LIGHT_POOL_SIZE = 10;

export class WorldBuilder {
  public readonly root = new THREE.Group();
  public readonly staticColliders: AABB[] = [];
  public readonly doors = new Map<string, DoorRuntime>();
  public readonly interactables = new Map<string, InteractableRuntime>();
  public readonly hidingSpots = new Map<string, HidingSpotDef>();
  public readonly virtualLights: VirtualZoneLight[] = [];
  public readonly zoneLights: VirtualZoneLight[] = this.virtualLights;
  public readonly roomGroups = new Map<string, THREE.Group>();

  public brassRings: THREE.Mesh[] = [];
  public waterRippleRings: THREE.Mesh[] = [];
  public steamJetMesh: THREE.Mesh | null = null;
  public steamBlockingCollider: AABB | null = null;
  public porticoFireGateMesh: THREE.Mesh | null = null;
  public vaultBlastDoorMesh: THREE.Mesh | null = null;
  public vaultDoorCollider: AABB | null = null;
  public elevatorCabGroup: THREE.Group = new THREE.Group();
  public shortcut3HatchPivot: THREE.Group | null = null;
  public elevatorY = 0.0;
  public elevatorTargetY = 0.0;
  public rainLines: THREE.LineSegments | null = null;

  // R5-PERF-01 & R5-PERF-02: Constant-topology hardware light pool (zero shader recompilations during traversal!)
  private readonly pointLightPool: THREE.PointLight[] = [];
  private readonly shadowSpot: THREE.SpotLight;
  private readonly shadowSpotTarget: THREE.Object3D;

  private mats: ProceduralMaterialLibrary;
  private optimizationEnabled = true;
  private stairGroup: THREE.Group | null = null;
  private batchToggles: Array<{ unbatched: THREE.Group; batched: THREE.Group }> = [];

  constructor(mats: ProceduralMaterialLibrary) {
    this.mats = mats;

    for (let i = 0; i < POINT_LIGHT_POOL_SIZE; i++) {
      const pt = new THREE.PointLight(0xffcf8b, 0, 18, 1.25);
      pt.castShadow = false;
      pt.visible = true;
      this.pointLightPool.push(pt);
      this.root.add(pt);
    }

    this.shadowSpot = new THREE.SpotLight(0xffcf8b, 0, 28, Math.PI * 0.46, 0.58, 1.25);
    this.shadowSpot.castShadow = true;
    this.shadowSpot.visible = true;
    this.shadowSpot.shadow.mapSize.set(512, 512);
    this.shadowSpot.shadow.bias = -0.0015;
    this.shadowSpotTarget = new THREE.Object3D();
    this.shadowSpot.target = this.shadowSpotTarget;
    this.root.add(this.shadowSpot);
    this.root.add(this.shadowSpotTarget);
  }

  public setOptimizationEnabled(enabled: boolean): void {
    this.optimizationEnabled = enabled;
    for (const pair of this.batchToggles) {
      pair.batched.visible = enabled;
      pair.unbatched.visible = !enabled;
    }
    if (!enabled) {
      for (const grp of this.roomGroups.values()) {
        grp.visible = true;
      }
    }
  }

  public isOptimizationEnabled(): boolean {
    return this.optimizationEnabled;
  }

  // Temporarily exposes every room and batch group for a single-frame GPU VAO/texture/shader prewarm pass
  public prepareAllObjectsForPrewarm(): () => void {
    const prevRoomVis = new Map<string, boolean>();
    for (const [id, grp] of this.roomGroups.entries()) {
      prevRoomVis.set(id, grp.visible);
      grp.visible = true;
    }
    const prevBatches = this.batchToggles.map((p) => ({
      pair: p,
      bVis: p.batched.visible,
      uVis: p.unbatched.visible,
    }));
    for (const p of this.batchToggles) {
      p.batched.visible = true;
      p.unbatched.visible = true;
    }
    return () => {
      for (const [id, grp] of this.roomGroups.entries()) {
        grp.visible = prevRoomVis.get(id) ?? true;
      }
      for (const entry of prevBatches) {
        entry.pair.batched.visible = entry.bVis;
        entry.pair.unbatched.visible = entry.uVis;
      }
    };
  }

  public buildAll(): void {
    this.buildRoomsAndArchitecture();
    this.buildStairsAndRamps();
    this.buildShortcut3MaintenanceLadder();
    this.buildElevatorShaftAndCab();
    this.buildDoors();
    this.buildLandmarksAndProps();
    this.buildHidingSpots();
    this.buildInteractablesAndSupports();
    this.buildSignpostingConduitsAndPipes();
    this.buildRainParticles();
    this.buildStaticBatches();
  }

  public getActiveShadowLightsCount(): number {
    return this.shadowSpot.visible && this.shadowSpot.castShadow ? 1 : 0;
  }

  public updateWorld(
    dt: number,
    elapsed: number,
    playerPos: Vec3,
    playerFloor: FloorId,
    act3PurgeActive: boolean,
    reduceFlashing: boolean,
    oscillatorSolved: boolean,
    steamSolved: boolean,
    cantorContained: boolean,
    highContrastInteractables: boolean,
    hoveredInteractableId: string | null,
    shortcut3Unlocked = false
  ): void {
    // 1. Animate doors & sync colliders
    for (const d of this.doors.values()) {
      const target = d.isOpen ? 1 : 0;
      if (Math.abs(d.openProgress - target) > 0.001) {
        const dir = target > d.openProgress ? 1 : -1;
        d.openProgress = Math.max(0, Math.min(1, d.openProgress + dir * dt * 2.8));
      }
      const swing = d.openProgress * (Math.PI * 0.48);
      const shakeOffset = d.bashShake > 0 ? Math.sin(elapsed * 55) * 0.06 * d.bashShake : 0;
      d.bashShake = Math.max(0, d.bashShake - dt * 2.2);

      const baseYaw = d.def.axis === 'x' ? 0 : -Math.PI / 2;
      if (d.def.style === 'blast_vault') {
        d.pivot.position.y = d.def.y + d.openProgress * (d.def.height - 0.15);
        d.pivot.rotation.y = baseYaw;
      } else {
        d.pivot.rotation.y = baseYaw + swing + shakeOffset;
      }

      const blocking = d.openProgress < 0.72;
      if (blocking) {
        const halfW = d.def.width * 0.5;
        const thick = 0.16;
        d.collider.minX = d.def.axis === 'x' ? d.def.x - halfW : d.def.x - thick;
        d.collider.maxX = d.def.axis === 'x' ? d.def.x + halfW : d.def.x + thick;
        d.collider.minZ = d.def.axis === 'z' ? d.def.z - halfW : d.def.z - thick;
        d.collider.maxZ = d.def.axis === 'z' ? d.def.z + halfW : d.def.z + thick;
        d.collider.minY = d.def.y;
        d.collider.maxY = d.def.y + d.def.height;
        d.collider.blocksLOS = true;
      } else {
        d.collider.minY = -9999;
        d.collider.maxY = -9998;
        d.collider.blocksLOS = false;
      }
    }

    // 2. Animate Freight Elevator Cab
    if (Math.abs(this.elevatorY - this.elevatorTargetY) > 0.004) {
      const step =
        Math.sign(this.elevatorTargetY - this.elevatorY) *
        Math.min(Math.abs(this.elevatorTargetY - this.elevatorY), dt * 5.2);
      this.elevatorY += step;
    } else {
      this.elevatorY = this.elevatorTargetY;
    }
    this.elevatorCabGroup.position.y = this.elevatorY;

    // 2b. Animate Shortcut 3 Maintenance Hatch Lid
    if (this.shortcut3HatchPivot) {
      const targetRot = shortcut3Unlocked ? -1.68 : 0.0;
      this.shortcut3HatchPivot.rotation.x = THREE.MathUtils.lerp(
        this.shortcut3HatchPivot.rotation.x,
        targetRot,
        Math.min(1, dt * 6.5)
      );
    }

    // 3. Animate B2 Concentric Brass Resonator Rings
    this.brassRings.forEach((ring, idx) => {
      if (oscillatorSolved) {
        ring.rotation.x = THREE.MathUtils.lerp(ring.rotation.x, 0, dt * 2.5);
        ring.rotation.z = THREE.MathUtils.lerp(ring.rotation.z, 0, dt * 2.5);
        ring.rotation.y += dt * 0.18 * (idx % 2 === 0 ? 1 : -1);
      } else {
        ring.rotation.x = Math.sin(elapsed * (0.5 + idx * 0.22) + idx) * 0.28;
        ring.rotation.z = Math.cos(elapsed * (0.4 + idx * 0.19) + idx) * 0.22;
        ring.rotation.y += dt * (0.35 + idx * 0.12) * (idx % 2 === 0 ? 1 : -1);
      }
    });

    // 4. Animate B3 Sump Water Ripple Rings
    this.waterRippleRings.forEach((ring, idx) => {
      const phase = (elapsed * 0.65 + idx * 0.33) % 1.0;
      const s = 0.4 + phase * 2.1;
      ring.scale.set(s, s, 1);
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = (1.0 - phase) * 0.35;
    });

    // 5. Steam Jet
    if (this.steamJetMesh && this.steamBlockingCollider) {
      this.steamJetMesh.visible = !steamSolved;
      if (!steamSolved) {
        this.steamJetMesh.scale.y = 0.92 + Math.sin(elapsed * 19) * 0.12;
        this.steamBlockingCollider.minY = 0;
        this.steamBlockingCollider.maxY = 2.6;
      } else {
        this.steamBlockingCollider.minY = -9999;
        this.steamBlockingCollider.maxY = -9998;
      }
    }

    // 6. Vault Containment Blast Door
    if (this.vaultBlastDoorMesh && this.vaultDoorCollider) {
      const targetVaultY = cantorContained ? -15.1 : -12.3;
      this.vaultBlastDoorMesh.position.y = THREE.MathUtils.lerp(
        this.vaultBlastDoorMesh.position.y,
        targetVaultY,
        dt * 6.0
      );
      if (cantorContained) {
        this.vaultDoorCollider.minY = -16.5;
        this.vaultDoorCollider.maxY = -13.5;
        this.vaultDoorCollider.blocksLOS = true;
      } else {
        this.vaultDoorCollider.minY = -9999;
        this.vaultDoorCollider.maxY = -9998;
        this.vaultDoorCollider.blocksLOS = false;
      }
    }

    // 7. Rain streaks
    if (this.rainLines) {
      this.rainLines.position.y = -((elapsed * 9.5) % 3.0);
    }

    // 8. Constant-Topology Light Pool Assignment (ZERO light/shadow shader variant changes!)
    this.updateLightPool(elapsed, playerPos, playerFloor, act3PurgeActive, reduceFlashing);

    // 8b. Room group distance & sightline culling
    if (this.optimizationEnabled) {
      for (const room of ROOMS) {
        const grp = this.roomGroups.get(room.id);
        if (!grp) continue;
        const cx = (room.bounds.minX + room.bounds.maxX) * 0.5;
        const cy = (room.bounds.minY + room.bounds.maxY) * 0.5;
        const cz = (room.bounds.minZ + room.bounds.maxZ) * 0.5;
        const dist = Math.hypot(cx - playerPos.x, (cy - playerPos.y) * 1.3, cz - playerPos.z);
        const keepSightline =
          room.id === 'R02' ||
          room.id === 'R08' ||
          room.id === 'R18' ||
          room.id === 'R16' ||
          room.floor === playerFloor;
        grp.visible = keepSightline || dist < 34;
      }
    }

    // 9. Interactable Highlight
    for (const [id, item] of this.interactables.entries()) {
      if (item.collected) continue;
      const isHovered = id === hoveredInteractableId;
      for (const m of item.highlightMats) {
        if (isHovered) {
          m.emissive.setHex(highContrastInteractables ? 0xffe46b : 0x7c5e24);
          m.emissiveIntensity = highContrastInteractables ? 0.95 : 0.55;
        } else if (highContrastInteractables) {
          m.emissive.setHex(0x4b3f16);
          m.emissiveIntensity = 0.35;
        } else {
          m.emissive.setHex(0x1b1406);
          m.emissiveIntensity = 0.18;
        }
      }
    }
  }

  private updateLightPool(
    elapsed: number,
    playerPos: Vec3,
    playerFloor: FloorId,
    act3PurgeActive: boolean,
    reduceFlashing: boolean
  ): void {
    let bestShadowAnchor: VirtualZoneLight | null = null;
    let bestShadowDistSq = Infinity;

    const candidates: Array<{ vl: VirtualZoneLight; lx: number; ly: number; lz: number; effIntensity: number; score: number }> = [];

    for (const vl of this.virtualLights) {
      const lx = vl.x;
      const ly = vl.isElevatorCab ? this.elevatorY + 2.4 : vl.y;
      const lz = vl.z;

      let effIntensity = vl.baseIntensity;
      if (vl.isStrobe) {
        if (!act3PurgeActive) {
          effIntensity = 0;
        } else if (reduceFlashing) {
          effIntensity = vl.baseIntensity * (0.65 + 0.35 * Math.sin(elapsed * 2.0));
        } else {
          effIntensity = vl.baseIntensity * (Math.sin(elapsed * 8.5) > 0.15 ? 1.45 : 0.15);
        }
      }
      if (effIntensity <= 0.01) continue;

      const dx = lx - playerPos.x;
      const dy = ly - (playerPos.y + 1.4);
      const dz = lz - playerPos.z;
      const weightedDistSq = dx * dx + dy * dy * 1.85 + dz * dz;

      if (vl.castsShadowAnchor && weightedDistSq < bestShadowDistSq) {
        bestShadowDistSq = weightedDistSq;
        bestShadowAnchor = vl;
      }

      const verticalSightline =
        ((playerFloor === 'G1' || playerFloor === 'G2') && (vl.roomId === 'R02' || vl.roomId === 'R08')) ||
        ((playerFloor === 'B1' || playerFloor === 'B2') && vl.roomId === 'R18');

      if (!verticalSightline && weightedDistSq > 34 * 34) continue;

      const sameFloorBoost = vl.floor === playerFloor || verticalSightline ? 1.45 : 0.7;
      const score = ((effIntensity * vl.distance) / (weightedDistSq + 6.0)) * sameFloorBoost;
      candidates.push({ vl, lx, ly, lz, effIntensity, score });
    }

    candidates.sort((a, b) => b.score - a.score);

    for (let i = 0; i < POINT_LIGHT_POOL_SIZE; i++) {
      const pt = this.pointLightPool[i];
      if (i < candidates.length) {
        const c = candidates[i];
        pt.position.set(c.lx, c.ly, c.lz);
        pt.color.setHex(c.vl.color);
        pt.intensity = c.effIntensity;
        pt.distance = c.vl.distance;
        pt.decay = c.vl.decay;
      } else {
        pt.intensity = 0;
      }
    }

    if (bestShadowAnchor) {
      this.shadowSpot.position.set(bestShadowAnchor.x, bestShadowAnchor.y + 0.35, bestShadowAnchor.z);
      this.shadowSpotTarget.position.set(bestShadowAnchor.x, bestShadowAnchor.y - 6.0, bestShadowAnchor.z);
      this.shadowSpot.color.setHex(bestShadowAnchor.color);
      this.shadowSpot.distance = Math.max(18, bestShadowAnchor.distance * 1.25);
      this.shadowSpot.intensity = bestShadowAnchor.baseIntensity * 0.95;
    } else {
      this.shadowSpot.intensity = 0;
    }
  }

  private buildRoomsAndArchitecture(): void {
    const portalMap = this.computeRoomPortals();

    for (const room of ROOMS) {
      const grp = new THREE.Group();
      grp.name = `room_${room.id}`;
      this.roomGroups.set(room.id, grp);
      this.root.add(grp);

      const { minX, maxX, minY, maxY, minZ, maxZ } = room.bounds;
      const w = maxX - minX;
      const d = maxZ - minZ;
      const h = maxY - minY;

      const { floorMat, wallMat, ceilMat } = this.resolveRoomMaterials(room);

      if (room.id === 'R08') {
        this.addSlab(grp, -9, 9, minY - 0.25, minY, -8, -4.6, floorMat, true);
        this.addSlab(grp, -6.2, 6.2, minY - 0.25, minY, 4.6, 8, floorMat, true);
        this.addSlab(grp, -6.2, -5.5, minY - 0.25, minY, -4.6, 4.6, floorMat, true);
        this.addSlab(grp, 5.5, 6.2, minY - 0.25, minY, -4.6, 4.6, floorMat, true);

        this.buildOpenWroughtIronBalustrade(grp);
      } else if (room.id === 'R12') {
        this.addSlab(grp, 9, 23.6, minY - 0.25, minY, -16, -4, floorMat, true);
        this.addSlab(grp, 23.6, 26.8, minY - 0.25, minY, -16, -4.2, floorMat, true);
        this.addSlab(grp, 26.2, 26.8, minY - 0.25, minY, -4.2, -4, floorMat, true);
      } else if (room.id === 'R17') {
        // R5-SPATIAL-01: Carve physical 1.1m x 1.0m Shortcut 3 hatch opening at x: 7.85..8.95, z: -15.05..-14.05!
        this.addSlab(grp, 6.0, 7.85, minY - 0.25, minY, -16.0, 0.0, floorMat, true);
        this.addSlab(grp, 8.95, 15.1, minY - 0.25, minY, -16.0, 0.0, floorMat, true);
        this.addSlab(grp, 7.85, 8.95, minY - 0.25, minY, -16.0, -15.05, floorMat, true);
        this.addSlab(grp, 7.85, 8.95, minY - 0.25, minY, -14.05, 0.0, floorMat, true);
        this.addSlab(grp, 15.1, 18.0, minY - 0.25, minY, -5.8, 0.0, floorMat, true);
        this.addSlab(grp, 15.1, 18.0, minY - 0.25, minY, -16.0, -14.3, floorMat, true);
      } else if (room.id === 'R22') {
        this.addSlab(grp, -12.7, -6.0, minY - 0.25, minY, -26, -14, floorMat, true);
        this.addSlab(grp, -16.0, -12.7, minY - 0.25, minY, -15.6, -14, floorMat, true);
        this.addSlab(grp, -16.0, -12.7, minY - 0.25, minY, -26, -24.3, floorMat, true);
      } else if (room.id === 'R26') {
        this.addSlab(grp, -9.2, -8.0, -16.75, -16.5, -36, -30, floorMat, true);
        this.addSlab(
          grp,
          -38.0,
          -22.9,
          -11.75,
          -11.5,
          -40.0,
          -26.0,
          this.mats.getMaterial('terrazzo_wet', 5, 5),
          true
        );
      } else {
        this.addSlab(grp, minX, maxX, minY - 0.25, minY, minZ, maxZ, floorMat, true);
      }

      if (room.id !== 'R26') {
        if (room.id === 'R02') {
          const skyGlass = new THREE.MeshStandardMaterial({
            color: 0x325870,
            emissive: 0x224158,
            emissiveIntensity: 0.9,
            roughness: 0.18,
          });
          this.addSlab(grp, minX, maxX, 9.2, 9.45, minZ, maxZ, skyGlass, false);
        } else if (room.id === 'R07') {
          this.addSlab(grp, 23, 28.5, maxY, maxY + 0.25, -8, -4.2, ceilMat, true);
          this.addSlab(grp, 26.2, 28.5, maxY, maxY + 0.25, -4.2, 2.2, ceilMat, true);
          this.addSlab(grp, 23, 26.2, maxY, maxY + 0.25, 0.8, 2.2, ceilMat, true);
          this.addSlab(grp, 23.6, 26.2, 9.0, 9.25, -4.2, 0.8, ceilMat, true);
        } else if (room.id === 'R21') {
          // R5-SPATIAL-01: Carve matching 1.1m x 1.0m Shortcut 3 ceiling shaft opening in R21 (x: 7.85..8.95, z: -15.05..-14.05)
          this.addSlab(grp, 6.0, 7.85, maxY, maxY + 0.25, -24.0, -14.0, ceilMat, true);
          this.addSlab(grp, 8.95, 15.0, maxY, maxY + 0.25, -24.0, -14.0, ceilMat, true);
          this.addSlab(grp, 7.85, 8.95, maxY, maxY + 0.25, -24.0, -15.05, ceilMat, true);
          this.addSlab(grp, 7.85, 8.95, maxY, maxY + 0.25, -14.05, -14.0, ceilMat, true);
          this.addSlab(grp, 15.0, 18.0, maxY, maxY + 0.25, -24.0, -16.0, ceilMat, true);
        } else if (room.id === 'R23') {
          this.addSlab(grp, -12.6, 6.0, maxY, maxY + 0.25, -26.5, -16.0, ceilMat, true);
          this.addSlab(grp, -16.0, -12.6, -7.2, -6.95, -26.5, -16.0, ceilMat, true);
        } else if (room.id !== 'R08') {
          this.addSlab(grp, minX, maxX, maxY, maxY + 0.25, minZ, maxZ, ceilMat, true);
        }
      }

      const cutouts = portalMap.get(room.id) ?? [];
      const wallTopY = room.id === 'R02' ? 5.0 : maxY;
      this.buildWallWithCutouts2D(grp, 'north', minX, maxX, minY, wallTopY, minZ, wallMat, cutouts);
      this.buildWallWithCutouts2D(grp, 'south', minX, maxX, minY, wallTopY, maxZ, wallMat, cutouts);
      this.buildWallWithCutouts2D(grp, 'west', minZ, maxZ, minY, wallTopY, minX, wallMat, cutouts);
      this.buildWallWithCutouts2D(grp, 'east', minZ, maxZ, minY, wallTopY, maxX, wallMat, cutouts);

      this.addRoomLightingAndPlaque(grp, room, w, h, d);
    }
  }

  private buildOpenWroughtIronBalustrade(grp: THREE.Group): void {
    const iron = this.mats.getMaterial('dark_iron');
    const brass = this.mats.getMaterial('tarnished_brass');

    this.staticColliders.push(
      { minX: -5.55, maxX: 5.55, minY: 5.0, maxY: 6.12, minZ: -4.62, maxZ: -4.45, blocksLOS: false },
      { minX: -5.55, maxX: 5.55, minY: 5.0, maxY: 6.12, minZ: 4.45, maxZ: 4.62, blocksLOS: false },
      { minX: -5.55, maxX: -5.38, minY: 5.0, maxY: 6.12, minZ: -4.6, maxZ: 4.6, blocksLOS: false },
      { minX: 5.38, maxX: 5.55, minY: 5.0, maxY: 6.12, minZ: -4.6, maxZ: 4.6, blocksLOS: false }
    );

    for (const zRail of [-4.53, 4.53]) {
      this.addSolidBox(grp, -5.55, 5.55, 5.0, 5.1, zRail - 0.05, zRail + 0.05, iron, false);
      this.addSolidBox(grp, -5.58, 5.58, 6.04, 6.13, zRail - 0.06, zRail + 0.06, brass, false);
    }
    for (const xRail of [-5.47, 5.47]) {
      this.addSolidBox(grp, xRail - 0.05, xRail + 0.05, 5.0, 5.1, -4.55, 4.55, iron, false);
      this.addSolidBox(grp, xRail - 0.06, xRail + 0.06, 6.04, 6.13, -4.58, 4.58, brass, false);
    }

    const picketCoords: Array<[number, number]> = [];
    for (let x = -5.25; x <= 5.25; x += 0.35) {
      picketCoords.push([x, -4.53], [x, 4.53]);
    }
    for (let z = -4.2; z <= 4.2; z += 0.35) {
      picketCoords.push([-5.47, z], [5.47, z]);
    }

    const picketGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.96, 6);
    const inst = new THREE.InstancedMesh(picketGeo, iron, picketCoords.length);
    const dummy = new THREE.Object3D();
    picketCoords.forEach(([px, pz], idx) => {
      dummy.position.set(px, 5.56, pz);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
    });
    inst.castShadow = true;
    grp.add(inst);
  }

  private computeRoomPortals(): Map<string, PortalCutout[]> {
    const map = new Map<string, PortalCutout[]>();
    const addCutout = (roomId: string, c: PortalCutout) => {
      const list = map.get(roomId) ?? [];
      list.push(c);
      map.set(roomId, list);
    };

    for (const door of DOORS) {
      for (const room of ROOMS) {
        const b = room.bounds;
        const yOverlap = door.y >= b.minY - 0.5 && door.y < b.maxY;
        if (!yOverlap) continue;

        if (door.axis === 'x') {
          if (Math.abs(door.z - b.minZ) < 0.25 && door.x > b.minX && door.x < b.maxX) {
            addCutout(room.id, { wall: 'north', center: door.x, width: door.width, bottomY: door.y, topY: door.y + door.height });
          }
          if (Math.abs(door.z - b.maxZ) < 0.25 && door.x > b.minX && door.x < b.maxX) {
            addCutout(room.id, { wall: 'south', center: door.x, width: door.width, bottomY: door.y, topY: door.y + door.height });
          }
        } else {
          if (Math.abs(door.x - b.minX) < 0.25 && door.z > b.minZ && door.z < b.maxZ) {
            addCutout(room.id, { wall: 'west', center: door.z, width: door.width, bottomY: door.y, topY: door.y + door.height });
          }
          if (Math.abs(door.x - b.maxX) < 0.25 && door.z > b.minZ && door.z < b.maxZ) {
            addCutout(room.id, { wall: 'east', center: door.z, width: door.width, bottomY: door.y, topY: door.y + door.height });
          }
        }
      }
    }

    addCutout('R07', { wall: 'east', center: -4.0, width: 2.2, bottomY: 0.0, topY: 2.6 });
    addCutout('R13', { wall: 'east', center: -4.0, width: 2.2, bottomY: -5.5, topY: -2.9 });
    addCutout('R24', { wall: 'east', center: -4.0, width: 2.2, bottomY: -16.5, topY: -13.9 });

    addCutout('R12', { wall: 'south', center: 24.9, width: 2.6, bottomY: 0.0, topY: 8.8 });

    addCutout('R21', { wall: 'south', center: 16.4, width: 2.6, bottomY: -11.0, topY: -5.0 });
    addCutout('R17', { wall: 'north', center: 16.4, width: 2.6, bottomY: -11.0, topY: -1.8 });

    addCutout('R22', { wall: 'north', center: -14.1, width: 2.8, bottomY: -16.5, topY: -7.2 });
    addCutout('R23', { wall: 'south', center: -14.1, width: 2.8, bottomY: -16.5, topY: -7.2 });

    addCutout('R16', { wall: 'north', center: 0.0, width: 8.4, bottomY: -4.5, topY: -2.2, isWindow: true });
    addCutout('R18', { wall: 'south', center: 0.0, width: 8.4, bottomY: -4.5, topY: -2.2, isWindow: true });
    addCutout('R19', { wall: 'north', center: 1.7, width: 5.0, bottomY: -10.0, topY: -8.0, isWindow: true });
    addCutout('R18', { wall: 'south', center: 1.7, width: 5.0, bottomY: -10.0, topY: -8.0, isWindow: true });

    return map;
  }

  private buildWallWithCutouts2D(
    grp: THREE.Group,
    wall: PortalCutout['wall'],
    spanMin: number,
    spanMax: number,
    bottomY: number,
    topY: number,
    fixedCoord: number,
    mat: THREE.Material,
    allCutouts: PortalCutout[]
  ): void {
    const thick = 0.22;
    const cuts = allCutouts.filter(
      (c) => c.wall === wall && c.topY > bottomY + 0.03 && c.bottomY < topY - 0.03
    );

    const rawSplits = [spanMin, spanMax];
    for (const c of cuts) {
      rawSplits.push(Math.max(spanMin, c.center - c.width * 0.5));
      rawSplits.push(Math.min(spanMax, c.center + c.width * 0.5));
    }
    rawSplits.sort((a, b) => a - b);

    const splits: number[] = [];
    for (const v of rawSplits) {
      if (splits.length === 0 || v - splits[splits.length - 1] > 0.02) {
        splits.push(v);
      }
    }

    for (let i = 0; i < splits.length - 1; i++) {
      const s0 = splits[i];
      const s1 = splits[i + 1];
      const mid = (s0 + s1) * 0.5;

      const activeIntervals = cuts
        .filter((c) => mid > c.center - c.width * 0.5 && mid < c.center + c.width * 0.5)
        .map((c) => ({
          y0: Math.max(bottomY, c.bottomY),
          y1: Math.min(topY, c.topY),
          isWindow: Boolean(c.isWindow),
        }))
        .filter((iv) => iv.y1 > iv.y0 + 0.02)
        .sort((a, b) => a.y0 - b.y0);

      const merged: Array<{ y0: number; y1: number }> = [];
      for (const iv of activeIntervals) {
        if (merged.length === 0 || iv.y0 > merged[merged.length - 1].y1 + 0.01) {
          merged.push({ y0: iv.y0, y1: iv.y1 });
        } else {
          merged[merged.length - 1].y1 = Math.max(merged[merged.length - 1].y1, iv.y1);
        }
      }

      let curY = bottomY;
      for (const m of merged) {
        if (m.y0 > curY + 0.03) {
          this.emitWallPiece(grp, wall, s0, s1, curY, m.y0, fixedCoord, thick, mat);
        }
        curY = m.y1;
      }
      if (curY < topY - 0.03) {
        this.emitWallPiece(grp, wall, s0, s1, curY, topY, fixedCoord, thick, mat);
      }

      for (const iv of activeIntervals) {
        if (iv.isWindow) {
          this.emitGlassPane(grp, wall, s0, s1, iv.y0, iv.y1, fixedCoord);
        }
      }
    }
  }

  private emitWallPiece(
    grp: THREE.Group,
    wall: PortalCutout['wall'],
    s0: number,
    s1: number,
    y0: number,
    y1: number,
    fixed: number,
    thick: number,
    mat: THREE.Material
  ): void {
    const halfT = thick * 0.5;
    if (wall === 'north' || wall === 'south') {
      this.addSolidBox(grp, s0, s1, y0, y1, fixed - halfT, fixed + halfT, mat, true, true, true);
    } else {
      this.addSolidBox(grp, fixed - halfT, fixed + halfT, y0, y1, s0, s1, mat, true, true, true);
    }
  }

  private emitGlassPane(
    grp: THREE.Group,
    wall: PortalCutout['wall'],
    s0: number,
    s1: number,
    y0: number,
    y1: number,
    fixed: number
  ): void {
    const glass = this.mats.getMaterial('frosted_glass');
    if (wall === 'north' || wall === 'south') {
      this.addSolidBox(grp, s0, s1, y0, y1, fixed - 0.04, fixed + 0.04, glass, true, false, false);
    } else {
      this.addSolidBox(grp, fixed - 0.04, fixed + 0.04, y0, y1, s0, s1, glass, true, false, false);
    }
  }

  private buildStairsAndRamps(): void {
    const stairGroup = new THREE.Group();
    stairGroup.name = 'stairs_and_ramps';
    this.stairGroup = stairGroup;
    this.root.add(stairGroup);

    const stone = this.mats.getMaterial('terrazzo_wet', 2, 2);
    const grate = this.mats.getMaterial('steel_grate', 3, 3);
    const brick = this.mats.getMaterial('culvert_brick', 4, 2);
    const concrete = this.mats.getMaterial('brutalist_concrete', 2, 2);
    const brass = this.mats.getMaterial('tarnished_brass');

    for (const sr of STAIR_RAMPS) {
      const steps = sr.id === 'ramp_b3_dawn_culvert' ? 28 : 16;
      const mat = sr.id.includes('culvert') ? brick : sr.id.includes('b') ? grate : stone;

      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const yStep = THREE.MathUtils.lerp(sr.yStart, sr.yEnd, (t0 + t1) * 0.5);

        if (sr.axis === 'z') {
          const z0 = THREE.MathUtils.lerp(sr.minZ, sr.maxZ, t0);
          const z1 = THREE.MathUtils.lerp(sr.minZ, sr.maxZ, t1);
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(sr.maxX - sr.minX, 0.24, Math.abs(z1 - z0) + 0.04),
            mat
          );
          mesh.position.set((sr.minX + sr.maxX) * 0.5, yStep - 0.14, (z0 + z1) * 0.5);
          mesh.receiveShadow = true;
          stairGroup.add(mesh);
        } else {
          const x0 = THREE.MathUtils.lerp(sr.minX, sr.maxX, t0);
          const x1 = THREE.MathUtils.lerp(sr.minX, sr.maxX, t1);
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.05, 0.28, sr.maxZ - sr.minZ),
            mat
          );
          mesh.position.set((x0 + x1) * 0.5, yStep - 0.15, (sr.minZ + sr.maxZ) * 0.5);
          mesh.receiveShadow = true;
          stairGroup.add(mesh);
        }
      }
    }

    // R4-PHYSICS-01 & R5-PHYSICS-02 fix: Sloped side-rail colliders follow stair slope while keeping BOTH
    // full-width stair walking centerlines (12/12 directions) AND ground under-stair passages to D02 & D03 completely open!
    const numRailSegs = 10;
    for (let k = 0; k < numRailSegs; k++) {
      const z0 = THREE.MathUtils.lerp(-4.6, 3.8, k / numRailSegs);
      const z1 = THREE.MathUtils.lerp(-4.6, 3.8, (k + 1) / numRailSegs);
      const tMid = (k + 0.5) / numRailSegs;
      const yMid = THREE.MathUtils.lerp(5.0, 0.0, tMid);
      const rMinY = Math.max(0.0, yMid - 0.14);
      const rMaxY = yMid + 1.14;

      for (const rx of [-6.11, 6.11, 8.59]) {
        this.staticColliders.push({
          minX: rx - 0.07,
          maxX: rx + 0.07,
          minY: rMinY,
          maxY: rMaxY,
          minZ: z0,
          maxZ: z1,
          blocksLOS: false,
        });
      }
    }

    for (let k = 0; k < 8; k++) {
      const z0 = THREE.MathUtils.lerp(-4.2, 0.6, k / 8);
      const z1 = THREE.MathUtils.lerp(-4.2, 0.6, (k + 1) / 8);
      const yMid = THREE.MathUtils.lerp(5.0, 0.0, (k + 0.5) / 8);
      for (const rx of [23.7, 26.1]) {
        this.staticColliders.push({
          minX: rx - 0.08,
          maxX: rx + 0.08,
          minY: Math.max(0.0, yMid - 0.14),
          maxY: yMid + 1.25,
          minZ: z0,
          maxZ: z1,
          blocksLOS: false,
        });
      }
    }

    // Brass-framed Under-Stair Admissions (D02) Portal Archway + Directional Sign (non-colliding trim above head height)
    this.addSolidBox(stairGroup, -6.22, -6.02, 2.25, 2.42, -2.4, 1.05, brass, false);
    this.addSolidBox(stairGroup, -6.22, -6.02, 0.0, 2.35, -2.48, -2.32, brass, false);
    const admSignTex = this.mats.makePlaqueTexture('← G1-03 ADMISSIONS', 'PATIENT RECORDS & LEDGERS');
    const admSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 0.36),
      new THREE.MeshStandardMaterial({
        map: admSignTex,
        emissiveMap: admSignTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.52,
      })
    );
    admSign.position.set(-5.98, 2.34, -0.7);
    admSign.rotation.y = Math.PI / 2;
    stairGroup.add(admSign);
    this.addZonePointLight(stairGroup, 'G1', 'R02', -7.6, 2.25, -0.2, 0xffcf87, 2.6, 8.5);
    this.addZonePointLight(stairGroup, 'G1', 'R02', 7.6, 2.35, -3.8, 0xffcf87, 2.4, 8.5);

    for (const sx of [-6.12, 6.12, 8.58]) {
      const slopeRail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 9.8), brass);
      slopeRail.position.set(sx, 3.45, -0.4);
      slopeRail.rotation.x = 0.54;
      stairGroup.add(slopeRail);
    }

    this.addSolidBox(stairGroup, 23.6, 23.76, 2.45, 8.9, -4.2, -1.5, concrete, true, true, true);
    this.addSolidBox(stairGroup, 26.04, 26.2, 2.45, 8.9, -4.2, -1.5, concrete, true, true, true);
    this.addSolidBox(stairGroup, 23.6, 23.76, 0.0, 8.9, -1.5, 0.6, concrete, true, true, true);
    this.addSolidBox(stairGroup, 26.04, 26.2, 0.0, 8.9, -1.5, 0.6, concrete, true, true, true);
    this.addSolidBox(stairGroup, 14.98, 15.16, -11.0, -4.3, -14.2, -5.8, concrete, true, true, true);
    this.addSolidBox(stairGroup, -12.76, -12.56, -16.5, -7.2, -24.15, -15.55, concrete, true, true, true);
    this.addSolidBox(stairGroup, -16.0, -15.35, -11.0, -7.2, -15.72, -15.48, concrete, true, true, true);

    this.addSolidBox(stairGroup, -23.0, -8.0, -16.5, -7.5, -35.45, -35.22, brick, true, true);
    this.addSolidBox(stairGroup, -23.0, -8.0, -16.5, -7.5, -30.78, -30.55, brick, true, true);
    this.addSlab(stairGroup, -23.0, -8.0, -7.5, -7.2, -35.45, -30.55, brick, true);
  }

  // R5-SPATIAL-01 fix: Physically constructed B2<->B1 pneumatic maintenance shaft, hatch coaming, hinged cover, safety curb rails, and 21-rung vertical steel ladder!
  private buildShortcut3MaintenanceLadder(): void {
    const r17 = this.roomGroups.get('R17') ?? this.root;
    const r21 = this.roomGroups.get('R21') ?? this.root;
    const iron = this.mats.getMaterial('dark_iron');
    const brass = this.mats.getMaterial('tarnished_brass');
    const concrete = this.mats.getMaterial('brutalist_concrete', 1, 1);

    // 1. Enclosed inter-floor chute collar connecting B2 ceiling (y=-7.2) to B1 floor (y=-5.5) around shaft x: 7.85..8.95, z: -15.05..-14.05
    this.addSolidBox(r21, 7.73, 7.85, -7.25, -5.48, -15.15, -14.0, concrete, false);
    this.addSolidBox(r21, 8.95, 9.07, -7.25, -5.48, -15.15, -14.0, concrete, false);
    this.addSolidBox(r21, 7.73, 9.07, -7.25, -5.48, -15.17, -15.05, concrete, false);
    this.addSolidBox(r21, 7.73, 9.07, -7.25, -5.48, -14.05, -13.96, concrete, false);

    // Brass hatch coaming frames at B2 ceiling & B1 floor
    this.addSolidBox(r21, 7.76, 9.04, -7.26, -7.14, -15.12, -15.03, brass, false);
    this.addSolidBox(r21, 7.76, 9.04, -7.26, -7.14, -14.07, -13.98, brass, false);
    this.addSolidBox(r21, 7.76, 7.86, -7.26, -7.14, -15.12, -13.98, brass, false);
    this.addSolidBox(r21, 8.94, 9.04, -7.26, -7.14, -15.12, -13.98, brass, false);

    this.addSolidBox(r17, 7.76, 9.04, -5.5, -5.38, -15.12, -15.03, brass, false);
    this.addSolidBox(r17, 7.76, 9.04, -5.5, -5.38, -14.07, -13.98, brass, false);
    this.addSolidBox(r17, 7.76, 7.86, -5.5, -5.38, -15.12, -13.98, brass, false);
    this.addSolidBox(r17, 8.94, 9.04, -5.5, -5.38, -15.12, -13.98, brass, false);

    // 2. Safe-edge tubular guardrails on B1 (blocksLOS: false so int_shortcut3_top targeting is never occluded, while preventing accidental falls into open shaft!)
    this.staticColliders.push(
      { minX: 7.74, maxX: 7.86, minY: -5.5, maxY: -4.42, minZ: -15.14, maxZ: -13.98, blocksLOS: false },
      { minX: 8.94, maxX: 9.06, minY: -5.5, maxY: -4.42, minZ: -15.14, maxZ: -13.98, blocksLOS: false },
      { minX: 7.74, maxX: 9.06, minY: -5.5, maxY: -4.42, minZ: -15.15, maxZ: -15.03, blocksLOS: false },
      { minX: 7.78, maxX: 9.02, minY: -5.5, maxY: -4.52, minZ: -14.07, maxZ: -13.98, blocksLOS: false }
    );

    // Visible B1 tubular iron guardrails & safety swing bar
    for (const [px, pz] of [
      [7.8, -15.08],
      [9.0, -15.08],
      [7.8, -14.02],
      [9.0, -14.02],
    ]) {
      this.addSolidBox(r17, px - 0.035, px + 0.035, -5.5, -4.42, pz - 0.035, pz + 0.035, iron, false);
    }
    this.addSolidBox(r17, 7.78, 7.84, -4.48, -4.41, -15.1, -14.0, brass, false);
    this.addSolidBox(r17, 8.96, 9.02, -4.48, -4.41, -15.1, -14.0, brass, false);
    this.addSolidBox(r17, 7.78, 9.02, -4.48, -4.41, -15.11, -15.05, brass, false);
    this.addSolidBox(r17, 7.8, 9.0, -4.64, -4.58, -14.05, -13.99, brass, false); // Safety swing bar

    // 3. Hinged heavy steel hatch lid (swings open along north hinge when Shortcut 3 is unbolted)
    const hatchPivot = new THREE.Group();
    hatchPivot.position.set(8.4, -5.42, -15.04);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.07, 0.98), iron);
    lid.position.set(0, 0, 0.49);
    hatchPivot.add(lid);
    const lidWheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 18), brass);
    lidWheel.rotation.x = Math.PI / 2;
    lidWheel.position.set(0, 0.055, 0.49);
    hatchPivot.add(lidWheel);
    this.shortcut3HatchPivot = hatchPivot;
    this.root.add(hatchPivot);

    // 4. Full-height vertical steel ladder (y = -11.0 in B2 up to gooseneck grab-rails y = -4.38 in B1)
    const ladderGrp = new THREE.Group();
    for (const sx of [8.14, 8.66]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 6.62, 0.065), iron);
      rail.position.set(sx, -7.69, -14.14);
      ladderGrp.add(rail);
    }

    const rungCount = 21;
    const rungGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.52, 8);
    rungGeo.rotateZ(Math.PI / 2);
    const rungInst = new THREE.InstancedMesh(rungGeo, brass, rungCount);
    const rDummy = new THREE.Object3D();
    for (let i = 0; i < rungCount; i++) {
      rDummy.position.set(8.4, -10.7 + i * 0.3, -14.16);
      rDummy.updateMatrix();
      rungInst.setMatrixAt(i, rDummy.matrix);
    }
    ladderGrp.add(rungInst);
    this.root.add(ladderGrp);

    // Warm caged bulkhead light inside the maintenance shaft so ladder & hatch read clearly from both B2 & B1
    this.addZonePointLight(r21, 'B2', 'R21', 8.4, -6.5, -14.6, 0xffbe6b, 2.6, 9.0);
  }

  private buildElevatorShaftAndCab(): void {
    const shaftGroup = new THREE.Group();
    const concrete = this.mats.getMaterial('brutalist_concrete', 2, 6);
    const grate = this.mats.getMaterial('steel_grate', 2, 2);
    const iron = this.mats.getMaterial('dark_iron');
    const brass = this.mats.getMaterial('tarnished_brass');

    this.addSolidBox(shaftGroup, 31.5, 31.75, -17.0, 4.0, -5.6, -2.4, concrete, true, true);
    this.addSolidBox(shaftGroup, 28.5, 31.6, -17.0, 4.0, -5.6, -5.4, concrete, true, true);
    this.addSolidBox(shaftGroup, 28.5, 31.6, -17.0, 4.0, -2.6, -2.4, concrete, true, true);
    this.root.add(shaftGroup);

    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.22, 2.8), grate);
    floorMesh.position.set(30.0, -0.11, -4.0);
    this.elevatorCabGroup.add(floorMesh);

    const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.15, 2.8), iron);
    roofMesh.position.set(30.0, 2.65, -4.0);
    this.elevatorCabGroup.add(roofMesh);

    for (const [cx, cz] of [
      [28.65, -5.3],
      [28.65, -2.7],
      [31.35, -5.3],
      [31.35, -2.7],
    ]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.7, 0.1), brass);
      post.position.set(cx, 1.35, cz);
      this.elevatorCabGroup.add(post);
    }

    // Tracked in constant-topology virtual light pool (moves dynamically with elevatorY!)
    this.virtualLights.push({
      x: 30.0,
      y: 2.4,
      z: -4.0,
      color: 0xffb85c,
      baseIntensity: 2.6,
      distance: 7.2,
      decay: 1.25,
      floor: 'G1',
      roomId: 'R07',
      isElevatorCab: true,
    });

    this.root.add(this.elevatorCabGroup);
  }

  private buildDoors(): void {
    const woodMat = this.mats.getMaterial('walnut_panel', 1, 1);
    const glassDoorMat = this.mats.getMaterial('celadon_wainscot', 1, 1);
    const steelMat = this.mats.getMaterial('dark_iron');
    const brass = this.mats.getMaterial('tarnished_brass');

    // Share tritium signbar materials & handle/sign geometries across all 27 doors
    const lockedSignMat = new THREE.MeshStandardMaterial({
      color: 0x101815,
      emissive: 0xd9892b,
      emissiveIntensity: 0.9,
    });
    const unlockedSignMat = new THREE.MeshStandardMaterial({
      color: 0x101815,
      emissive: 0x45c486,
      emissiveIntensity: 0.9,
    });
    const handleGeo = new THREE.BoxGeometry(0.14, 0.34, 0.18);
    const signBarGeo = new THREE.BoxGeometry(0.7, 0.18, 0.3);

    for (const def of DOORS) {
      const frame = new THREE.Group();
      const pivot = new THREE.Group();
      pivot.position.set(
        def.axis === 'x' ? def.x - def.width * 0.5 : def.x,
        def.y,
        def.axis === 'z' ? def.z - def.width * 0.5 : def.z
      );

      const leafMat =
        def.style === 'wood_ward'
          ? woodMat
          : def.style === 'glass_double'
          ? glassDoorMat
          : steelMat;

      const leaf = new THREE.Mesh(new THREE.BoxGeometry(def.width, def.height, 0.12), leafMat);
      leaf.position.set(def.width * 0.5, def.height * 0.5, 0);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      pivot.add(leaf);

      const handle = new THREE.Mesh(handleGeo, brass);
      handle.position.set(def.width - 0.22, 1.05, 0);
      pivot.add(handle);

      const signBar = new THREE.Mesh(signBarGeo, def.lockedBy ? lockedSignMat : unlockedSignMat);
      signBar.position.set(def.x, def.y + def.height + 0.16, def.z);
      if (def.axis === 'z') signBar.rotation.y = -Math.PI / 2;
      frame.add(signBar);

      pivot.rotation.y = def.axis === 'x' ? 0 : -Math.PI / 2;

      frame.add(pivot);
      this.root.add(frame);

      const halfW = def.width * 0.5;
      const thick = 0.16;
      const collider: AABB = {
        minX: def.axis === 'x' ? def.x - halfW : def.x - thick,
        maxX: def.axis === 'x' ? def.x + halfW : def.x + thick,
        minY: def.y,
        maxY: def.y + def.height,
        minZ: def.axis === 'z' ? def.z - halfW : def.z - thick,
        maxZ: def.axis === 'z' ? def.z + halfW : def.z + thick,
        blocksLOS: !def.initialOpen,
        doorId: def.id,
      };
      if (def.initialOpen) {
        collider.minY = -9999;
        collider.maxY = -9998;
      }
      this.staticColliders.push(collider);

      this.doors.set(def.id, {
        def,
        pivot,
        leafMesh: leaf,
        isOpen: Boolean(def.initialOpen),
        isUnlocked: !def.lockedBy,
        openProgress: def.initialOpen ? 1 : 0,
        bashShake: 0,
        collider,
      });
    }
  }

  private buildLandmarksAndProps(): void {
    const brass = this.mats.getMaterial('tarnished_brass');
    const copper = this.mats.getMaterial('copper_bus');
    const iron = this.mats.getMaterial('dark_iron');
    const walnut = this.mats.getMaterial('walnut_panel');
    const porcelain = this.mats.getMaterial('porcelain_white');
    const concrete = this.mats.getMaterial('brutalist_concrete');
    const surgCloth = this.mats.getMaterial('surgical_cloth');
    const wedgeMat = this.mats.getMaterial('anechoic_wedge', 1, 1);

    const stormGlass = new THREE.MeshStandardMaterial({
      color: 0x45738c,
      emissive: 0x244963,
      emissiveIntensity: 0.9,
      roughness: 0.14,
    });

    // 1. R01 Portico Storm Gate & Metering Desk
    const r01 = this.roomGroups.get('R01')!;
    this.porticoFireGateMesh = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.2, 0.22), iron);
    this.porticoFireGateMesh.position.set(0, 1.6, 15.85);
    r01.add(this.porticoFireGateMesh);
    this.addSolidBox(r01, 0.8, 2.2, 0, 1.0, 11.8, 12.6, walnut, true, false, true);

    // 2. R02 G1 Triage Atrium
    const r02 = this.roomGroups.get('R02')!;
    this.addSolidBox(r02, -2.3, 2.3, 0, 1.02, 1.2, 2.55, walnut, true, false, true);
    this.addSolidBox(r02, -2.38, 2.38, 1.02, 1.09, 1.15, 2.6, brass, false);
    this.addSolidBox(r02, -2.34, 2.34, 0, 0.12, 1.18, 2.58, brass, false);
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, 0.36, 12), brass);
    lampStem.position.set(-0.75, 1.25, 1.85);
    r02.add(lampStem);
    const lampShade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.2, 0.14, 16),
      new THREE.MeshStandardMaterial({ color: 0x2c8a5e, emissive: 0x1e6b46, emissiveIntensity: 0.9 })
    );
    lampShade.position.set(-0.75, 1.44, 1.85);
    r02.add(lampShade);
    this.addZonePointLight(r02, 'G1', 'R02', 0, 2.3, 2.4, 0xffcf87, 3.2, 11);

    const sconceMat = new THREE.MeshStandardMaterial({
      color: 0xffe5b0,
      emissive: 0xffb85c,
      emissiveIntensity: 1.4,
    });
    for (const [px, pz] of [
      [-5.8, -4.6],
      [5.8, -4.6],
      [-5.8, 4.6],
      [5.8, 4.6],
    ]) {
      this.addSolidBox(r02, px - 0.34, px + 0.34, 0, 9.2, pz - 0.34, pz + 0.34, concrete, true, true, true);
      this.addSolidBox(r02, px - 0.44, px + 0.44, 0, 0.35, pz - 0.44, pz + 0.44, brass, false);
      this.addSolidBox(r02, px - 0.44, px + 0.44, 4.75, 5.05, pz - 0.44, pz + 0.44, brass, false);

      const sconce = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), sconceMat);
      const sx = px > 0 ? px - 0.42 : px + 0.42;
      sconce.position.set(sx, 2.65, pz);
      r02.add(sconce);
    }
    this.addZonePointLight(r02, 'G1', 'R02', -4.8, 2.8, 0, 0xffc97d, 2.4, 12);
    this.addZonePointLight(r02, 'G1', 'R02', 4.8, 2.8, 0, 0xffc97d, 2.4, 12);

    for (const wz of [-3.2, 0, 3.2]) {
      this.buildArchedStormWindow(r02, -8.84, 2.4, wz, Math.PI / 2, stormGlass, iron);
      this.buildArchedStormWindow(r02, -8.84, 6.9, wz, Math.PI / 2, stormGlass, iron);
      this.buildArchedStormWindow(r02, 8.84, 6.9, wz, -Math.PI / 2, stormGlass, iron);
    }

    for (const rz of [-4.5, -1.5, 1.5, 4.5]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.25, 0.26), iron);
      rib.position.set(0, 9.05, rz);
      rib.castShadow = true;
      r02.add(rib);
    }

    // 3. R03 Admissions Office
    const r03 = this.roomGroups.get('R03')!;
    this.addSolidBox(r03, -15.2, -13.2, 0, 1.0, -1.8, -0.4, walnut, true, false, true);
    this.addSolidBox(r03, -18.6, -17.4, 0, 1.9, -4.6, -1.2, iron, true, true, true);
    this.addSolidBox(r03, -17.5, -16.1, 0, 1.0, 1.6, 2.8, walnut, true);

    // 4. R04 East Ward Arched Storm Windows, Crouch Gurney & Instanced Broken Glass Shards (1 draw call instead of 27!)
    const r04 = this.roomGroups.get('R04')!;
    for (const wx of [11.5, 15.5, 19.5]) {
      this.buildArchedStormWindow(r04, wx, 2.1, -7.84, 0, stormGlass, iron);
    }
    this.addSolidBox(r04, 15.4, 17.0, 1.12, 1.32, -7.2, -5.6, porcelain, true, false, true);

    const shardMat = new THREE.MeshStandardMaterial({ color: 0xbce3e8, roughness: 0.08, metalness: 0.35 });
    const shardGeo = new THREE.ConeGeometry(0.12, 0.03, 4);
    const shardInst = new THREE.InstancedMesh(shardGeo, shardMat, BROKEN_GLASS_PATCHES.length * 9);
    const sDummy = new THREE.Object3D();
    let sIdx = 0;
    for (const patch of BROKEN_GLASS_PATCHES) {
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        const r = 0.25 + (i % 3) * 0.28;
        sDummy.position.set(patch.x + Math.cos(ang) * r, patch.y, patch.z + Math.sin(ang) * r);
        sDummy.rotation.set(0, i * 0.9, 0);
        sDummy.updateMatrix();
        shardInst.setMatrixAt(sIdx++, sDummy.matrix);
      }
    }
    this.root.add(shardInst);

    // 5. R05 Hydrotherapy Porcelain Tubs & R06 Steam Manifold
    const r05 = this.roomGroups.get('R05')!;
    for (const [tx, tz] of [
      [11.5, 2.6],
      [11.5, 7.4],
      [17.4, 2.6],
      [17.4, 7.4],
    ]) {
      this.addSolidBox(r05, tx - 0.95, tx + 0.95, 0, 0.78, tz - 0.55, tz + 0.55, porcelain, true, false, true);
      this.addSolidBox(r05, tx - 1.0, tx + 1.0, 0.76, 0.84, tz - 0.6, tz + 0.6, brass, false);
      const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 10), brass);
      faucet.position.set(tx - 0.82, 0.98, tz);
      r05.add(faucet);
    }

    const r06 = this.roomGroups.get('R06')!;
    const redPipe = this.mats.getMaterial('steam_pipe_red');
    this.addSolidBox(r06, 27.6, 29.2, 0, 2.8, 3.4, 6.8, redPipe, true, true, true);
    this.steamJetMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.85, 2.4, 16, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xdde7e6,
        emissive: 0x56686a,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
      })
    );
    this.steamJetMesh.position.set(25.4, 1.3, 5.0);
    this.steamJetMesh.rotation.z = Math.PI / 2;
    r06.add(this.steamJetMesh);
    this.steamBlockingCollider = {
      minX: 25.0,
      maxX: 26.2,
      minY: 0,
      maxY: 2.6,
      minZ: 2.3,
      maxZ: 8.9,
      tag: 'steam_hazard',
    };
    this.staticColliders.push(this.steamBlockingCollider);

    // 6. R08 Nurse Station & R09 Sculpted Operating Amphitheatre
    const r08 = this.roomGroups.get('R08')!;
    this.addSolidBox(r08, 0.9, 3.3, 5.0, 6.0, -7.85, -6.85, walnut, true, false, true);

    const r09 = this.roomGroups.get('R09')!;
    this.staticColliders.push({
      minX: -5.4,
      maxX: -3.1,
      minY: 5.0,
      maxY: 5.95,
      minZ: -14.1,
      maxZ: -12.9,
      blocksLOS: false,
    });
    this.addSolidBox(r09, -4.9, -3.9, 5.0, 5.14, -13.9, -13.1, iron, false);
    const tableCol = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.72, 16), brass);
    tableCol.position.set(-4.4, 5.5, -13.5);
    r09.add(tableCol);
    this.addSolidBox(r09, -5.45, -3.35, 5.82, 5.92, -14.08, -12.92, porcelain, false, false, true);
    this.addSolidBox(r09, -5.38, -3.42, 5.92, 6.0, -14.02, -12.98, surgCloth, false);
    const sideDrape = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 0.72), surgCloth);
    sideDrape.position.set(-4.4, 5.48, -12.91);
    r09.add(sideDrape);
    this.addSolidBox(r09, -3.45, -2.95, 5.0, 5.92, -13.8, -13.2, iron, false);

    const scialytic = new THREE.Group();
    scialytic.position.set(-4.4, 7.55, -13.5);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.45, 12), iron);
    stem.position.y = 0.72;
    scialytic.add(stem);
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 10, 24, Math.PI), brass);
    yoke.rotation.z = Math.PI;
    yoke.position.y = 0.25;
    scialytic.add(yoke);
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.18, 0.28, 28), brass);
    dome.castShadow = true;
    scialytic.add(dome);
    const sterHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.28, 10), porcelain);
    sterHandle.position.y = -0.22;
    scialytic.add(sterHandle);
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0xfff7de,
      emissive: 0xffe2a3,
      emissiveIntensity: 1.6,
    });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.06, 16), lensMat);
      lens.position.set(Math.cos(a) * 0.68, -0.13, Math.sin(a) * 0.68);
      scialytic.add(lens);
    }
    r09.add(scialytic);
    this.addZonePointLight(r09, 'G2', 'R09', -4.4, 7.1, -13.5, 0xfff0d1, 3.8, 11);

    this.staticColliders.push({
      minX: -8.8,
      maxX: -6.6,
      minY: 5.0,
      maxY: 6.25,
      minZ: -16.8,
      maxZ: -10.5,
      blocksLOS: false,
    });
    this.addSolidBox(r09, -7.3, -6.65, 5.0, 5.42, -16.8, -10.5, walnut, false, false, true);
    this.addSolidBox(r09, -8.0, -7.3, 5.0, 5.82, -16.8, -10.5, walnut, false, false, true);
    this.addSolidBox(r09, -8.75, -8.0, 5.0, 6.22, -16.8, -10.5, walnut, false, false, true);
    this.addSolidBox(r09, -6.7, -6.6, 5.42, 6.18, -16.8, -10.5, brass, false);

    // 7. R10 Radiology Lightbox & Safe
    const r10 = this.roomGroups.get('R10')!;
    const lightbox = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.15, 0.16),
      new THREE.MeshStandardMaterial({ color: 0xc8eef5, emissive: 0x6ecad8, emissiveIntensity: 1.1 })
    );
    lightbox.position.set(5.2, 6.55, -17.75);
    r10.add(lightbox);
    this.addSolidBox(r10, 6.4, 8.5, 5.0, 5.98, -14.5, -11.8, iron, true, false, true);

    // 8. R11 Somnology Beds & R12 Physician Study
    const r11 = this.roomGroups.get('R11')!;
    for (const bz of [-14.2, -10.2, -6.2]) {
      this.addSolidBox(r11, -18.2, -16.2, 5.0, 5.75, bz - 0.6, bz + 0.6, iron, true, false, true);
      this.addSolidBox(r11, -18.15, -16.25, 5.75, 5.88, bz - 0.55, bz + 0.55, surgCloth, false);
    }
    const r12 = this.roomGroups.get('R12')!;
    this.addSolidBox(r12, 13.8, 16.8, 5.0, 6.02, -13.6, -12.1, walnut, true, false, true);
    this.addSolidBox(r12, 9.4, 10.2, 5.0, 8.2, -15.6, -9.0, walnut, true, true, true);
    const dwUpper = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.15, 0.2), brass);
    dwUpper.position.set(21.5, 6.3, -15.8);
    r12.add(dwUpper);

    // 9. R14 B1 Hexagonal Security Rotunda
    const r14 = this.roomGroups.get('R14')!;
    const cageLampMat = new THREE.MeshStandardMaterial({
      color: 0xffba5c,
      emissive: 0xe89025,
      emissiveIntensity: 1.3,
    });
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const hx = Math.cos(ang) * 4.8;
      const hz = -4.0 + Math.sin(ang) * 4.8;
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 3.8, 6), concrete);
      pil.position.set(hx, -3.6, hz);
      pil.castShadow = true;
      pil.receiveShadow = true;
      r14.add(pil);

      const cageLamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), cageLampMat);
      cageLamp.position.set(hx * 0.88, -3.0, -4.0 + (hz + 4.0) * 0.88);
      r14.add(cageLamp);
    }
    const hexRing = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.16, 8, 6), brass);
    hexRing.rotation.x = Math.PI / 2;
    hexRing.position.set(0, -2.05, -4.0);
    r14.add(hexRing);

    this.addSolidBox(r14, -4.4, -2.5, -5.5, -4.45, -5.7, -2.3, iron, true, false, true);
    this.addSolidBox(r14, -4.45, -2.45, -4.45, -4.38, -5.75, -2.25, brass, false);
    for (let m = 0; m < 3; m++) {
      const mz = -4.95 + m * 0.95;
      const crtShell = new THREE.Group();
      crtShell.position.set(-3.45, -4.05, mz);
      crtShell.rotation.y = (1 - m) * 0.22;

      const casing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.68), iron);
      casing.castShadow = true;
      crtShell.add(casing);

      const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.54, 0.64), brass);
      bezel.position.x = 0.29;
      crtShell.add(bezel);

      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.54, 0.44),
        m === 1 ? this.mats.getMaterial('amber_crt') : this.mats.getMaterial('crt_phosphor')
      );
      screen.rotation.y = Math.PI / 2;
      screen.position.x = 0.335;
      crtShell.add(screen);
      r14.add(crtShell);
    }
    this.addZonePointLight(r14, 'B1', 'R14', -2.2, -3.6, -4.0, 0xf2a63b, 2.8, 10);

    this.addSolidBox(r14, -3.4, 3.2, -5.5, -4.48, -0.3, 0.8, walnut, true, false, true);

    const schematicTex = this.mats.makePlaqueTexture(
      'SUB-BASAL TYMPANIC COMPLEX',
      'B1 ROTUNDA • B2 ANECHOIC PIT • B3 SUBSTATION',
      '#e3a842',
      '#181610'
    );
    const schematicBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.35),
      new THREE.MeshStandardMaterial({
        map: schematicTex,
        emissiveMap: schematicTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.55,
      })
    );
    schematicBoard.position.set(0, -3.3, 1.82);
    schematicBoard.rotation.y = Math.PI;
    r14.add(schematicBoard);

    // 10. R15 B1 Cold Archives Shelving Island & Cryo Drawers
    const r15 = this.roomGroups.get('R15')!;
    this.addSolidBox(r15, 11.5, 16.5, -5.5, -2.6, -23.2, -20.8, iron, true, true, true);
    this.addSolidBox(r15, 13.5, 19.5, -5.5, -2.5, -27.8, -26.9, porcelain, true, true, true);

    // 11. R18 B2 Double-Height Anechoic Pit
    const r18 = this.roomGroups.get('R18')!;
    this.staticColliders.push({
      minX: -2.8,
      maxX: 2.8,
      minY: -11.0,
      maxY: -9.95,
      minZ: -30.5,
      maxZ: -25.0,
      blocksLOS: false,
    });
    const pitBasin = new THREE.Mesh(
      new THREE.CylinderGeometry(2.55, 2.1, 0.5, 32),
      new THREE.MeshStandardMaterial({ color: 0x0b1316, roughness: 0.9 })
    );
    pitBasin.position.set(0, -10.95, -27.8);
    r18.add(pitBasin);

    const pitCore = new THREE.Mesh(
      new THREE.TorusGeometry(1.9, 0.08, 12, 36),
      new THREE.MeshStandardMaterial({ color: 0x62e3f0, emissive: 0x2fb8cc, emissiveIntensity: 1.5 })
    );
    pitCore.rotation.x = Math.PI / 2;
    pitCore.position.set(0, -10.72, -27.8);
    r18.add(pitCore);

    for (const [px, pz] of [
      [-2.75, -25.05],
      [0, -25.05],
      [2.75, -25.05],
      [-2.75, -27.8],
      [2.75, -27.8],
      [-2.75, -30.45],
      [0, -30.45],
      [2.75, -30.45],
    ]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.02, 10), brass);
      post.position.set(px, -10.49, pz);
      r18.add(post);
    }
    this.addSolidBox(r18, -2.8, 2.8, -10.04, -9.96, -25.1, -25.0, brass, false);
    this.addSolidBox(r18, -2.8, 2.8, -10.04, -9.96, -30.5, -30.4, brass, false);
    this.addSolidBox(r18, -2.8, -2.7, -10.04, -9.96, -30.5, -25.0, brass, false);
    this.addSolidBox(r18, 2.7, 2.8, -10.04, -9.96, -30.5, -25.0, brass, false);

    for (const [idx, rad] of [3.6, 2.65, 1.7].entries()) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.15 - idx * 0.02, 18, 52), brass);
      ring.position.set(0.0, -6.2, -27.8);
      ring.castShadow = true;
      r18.add(ring);
      this.brassRings.push(ring);
    }
    for (const [cx, cz] of [
      [-3.4, -27.8],
      [3.4, -27.8],
      [0, -24.4],
      [0, -31.2],
    ]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 5.2, 8), brass);
      cable.position.set(cx, -4.3, cz);
      r18.add(cable);
    }

    this.addZonePointLight(r18, 'B2', 'R18', 0, -10.2, -27.8, 0x4fd4e6, 5.2, 18);
    this.addZonePointLight(r18, 'B2', 'R18', 3.5, -8.2, -23.5, 0xffc878, 3.4, 15);
    this.addZonePointLight(r18, 'B2', 'R18', -3.5, -4.2, -31.0, 0x72c6d9, 4.2, 18);

    const wedgeTransforms: Array<{ pos: [number, number, number]; rot: [number, number, number] }> = [];
    for (let wy = -10.2; wy <= -2.4; wy += 1.1) {
      for (let wz = -35.2; wz <= -21.2; wz += 1.1) {
        wedgeTransforms.push({ pos: [-5.72, wy, wz], rot: [0, 0, -Math.PI / 2] });
        if (wz < -24.0 && wz > -30.8) {
          wedgeTransforms.push({ pos: [5.72, wy, wz], rot: [0, 0, Math.PI / 2] });
        }
      }
      for (let wx = -5.0; wx <= 5.0; wx += 1.1) {
        wedgeTransforms.push({ pos: [wx, wy, -35.72], rot: [Math.PI / 2, 0, 0] });
      }
    }
    const wedgeGeo = new THREE.ConeGeometry(0.48, 0.62, 4);
    wedgeGeo.rotateY(Math.PI / 4);
    const wedgeInst = new THREE.InstancedMesh(wedgeGeo, wedgeMat, wedgeTransforms.length);
    const wDummy = new THREE.Object3D();
    wedgeTransforms.forEach((wt, i) => {
      wDummy.position.set(...wt.pos);
      wDummy.rotation.set(...wt.rot);
      wDummy.updateMatrix();
      wedgeInst.setMatrixAt(i, wDummy.matrix);
    });
    r18.add(wedgeInst);

    // 12. R20 B2 Cryo-Pathology Specimen Cylinders
    const r20 = this.roomGroups.get('R20')!;
    const cryoGlow = new THREE.MeshStandardMaterial({
      color: 0x56c7d6,
      emissive: 0x2a8f9e,
      emissiveIntensity: 0.95,
      transparent: true,
      opacity: 0.75,
      roughness: 0.12,
    });
    for (const cz of [-27.5, -31.0, -34.0]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.3, 20), cryoGlow);
      tank.position.set(8.2, -9.8, cz);
      tank.castShadow = true;
      r20.add(tank);
      this.addSolidBox(r20, 7.6, 8.8, -11.0, -8.6, cz - 0.6, cz + 0.6, iron, true, false, true);
    }

    // 13. R23/R24/R25 B3 Sump Water + Finned 13.8 kV Transformers
    const r23 = this.roomGroups.get('R23')!;
    const waterMat = this.mats.getMaterial('oil_water', 5, 5);
    const waterB3 = new THREE.Mesh(new THREE.PlaneGeometry(52, 32), waterMat);
    waterB3.rotation.x = -Math.PI / 2;
    waterB3.position.set(8, -16.36, -18);
    r23.add(waterB3);
    this.addSolidBox(r23, -10.5, -6.5, -16.5, -14.2, -24.5, -22.5, iron, true, true, true);

    const r24 = this.roomGroups.get('R24')!;
    const rippleGeo = new THREE.RingGeometry(0.32, 0.38, 28);
    for (const [rx, rz] of [
      [12.5, -17.5],
      [17.5, -12.0],
      [-4.0, -20.5],
    ]) {
      const rMat = new THREE.MeshBasicMaterial({
        color: 0x7be8ff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      const rMesh = new THREE.Mesh(rippleGeo, rMat);
      rMesh.rotation.x = -Math.PI / 2;
      rMesh.position.set(rx, -16.34, rz);
      this.root.add(rMesh);
      this.waterRippleRings.push(rMesh);
    }

    const arcMat = new THREE.MeshStandardMaterial({
      color: 0x8ef2ff,
      emissive: 0x42d4eb,
      emissiveIntensity: 1.5,
      roughness: 0.15,
    });
    const gaugeMat = new THREE.MeshStandardMaterial({
      color: 0xfff2cc,
      emissive: 0xffc46b,
      emissiveIntensity: 1.1,
    });
    const finPositions: Array<[number, number, number]> = [];
    const txCenters = [12.0, 17.0, 22.0];
    for (const tx of txCenters) {
      this.addSolidBox(r24, tx - 1.05, tx + 1.05, -16.5, -13.2, -16.2, -14.0, iron, true, true, true);
      this.addSolidBox(r24, tx - 1.15, tx + 1.15, -13.25, -13.08, -16.3, -13.9, brass, false);

      for (let fx = tx - 0.85; fx <= tx + 0.86; fx += 0.24) {
        finPositions.push([fx, -14.85, -16.32], [fx, -14.85, -13.88]);
      }

      for (const bx of [tx - 0.65, tx, tx + 0.65]) {
        const bushing = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.19, 0.82, 14), arcMat);
        bushing.position.set(bx, -12.68, -15.1);
        r24.add(bushing);
      }

      const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), gaugeMat);
      gauge.position.set(tx, -14.4, -16.24);
      gauge.rotation.y = Math.PI;
      r24.add(gauge);
      const gaugeBack = gauge.clone();
      gaugeBack.position.z = -13.96;
      gaugeBack.rotation.y = 0;
      r24.add(gaugeBack);
    }

    this.addSolidBox(r24, 11.2, 22.8, -12.28, -12.2, -15.16, -15.04, copper, false);
    this.addSolidBox(r24, 9.0, 22.5, -16.28, -16.14, -17.6, -17.42, this.mats.getMaterial('conduit_yellow'), false);

    const finGeo = new THREE.BoxGeometry(0.06, 2.65, 0.26);
    const finInst = new THREE.InstancedMesh(finGeo, brass, finPositions.length);
    const fDummy = new THREE.Object3D();
    finPositions.forEach(([fx, fy, fz], idx) => {
      fDummy.position.set(fx, fy, fz);
      fDummy.updateMatrix();
      finInst.setMatrixAt(idx, fDummy.matrix);
    });
    r24.add(finInst);

    this.addZonePointLight(r24, 'B3', 'R24', 11.5, -13.2, -18.2, 0xffc470, 4.2, 16);
    this.addZonePointLight(r24, 'B3', 'R24', 18.5, -12.6, -11.5, 0x62dcf0, 4.8, 18);
    this.addZonePointLight(r24, 'B3', 'R24', 24.5, -13.4, -6.5, 0xffc470, 3.6, 14);
    this.addZonePointLight(r24, 'B3', 'R24', 16.5, -12.4, -15.0, 0xe62e28, 5.2, 20, true);

    const r25 = this.roomGroups.get('R25')!;
    this.addSolidBox(r25, -3.1, -2.8, -16.5, -13.2, -36.8, -31.5, concrete, true, true, true);
    this.addSolidBox(r25, 2.8, 3.1, -16.5, -13.2, -36.8, -31.5, concrete, true, true, true);
    this.addSolidBox(r25, -3.1, 3.1, -16.5, -13.2, -37.1, -36.8, concrete, true, true, true);
    this.addZonePointLight(r25, 'B3', 'R25', 0, -13.8, -34.0, 0x56d8eb, 3.6, 12);
    this.addZonePointLight(r25, 'B3', 'R25', 0, -12.5, -29.0, 0xe62e28, 4.8, 16, true);

    this.vaultBlastDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(5.8, 2.9, 0.28), brass);
    this.vaultBlastDoorMesh.position.set(0, -12.3, -31.5);
    r25.add(this.vaultBlastDoorMesh);
    this.vaultDoorCollider = {
      minX: -2.9,
      maxX: 2.9,
      minY: -9999,
      maxY: -9998,
      minZ: -31.68,
      maxZ: -31.32,
      blocksLOS: false,
      tag: 'vault_bulkhead',
    };
    this.staticColliders.push(this.vaultDoorCollider);

    // 14. R26 Hillside Dawn Courtyard (open top uses COURTYARD_DAWN scene background/fog in main.ts)
    const r26 = this.roomGroups.get('R26')!;

    this.addSolidBox(r26, -30.2, -28.8, -11.5, -9.2, -37.0, -36.1, iron, true, true, true);
    this.addSolidBox(r26, -28.2, -26.8, -11.5, -10.48, -32.1, -30.9, walnut, true, false, true);
    const ironGate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.2, 3.6), iron);
    ironGate.position.set(-37.6, -9.9, -33.0);
    r26.add(ironGate);
  }

  private buildArchedStormWindow(
    grp: THREE.Group,
    x: number,
    y: number,
    z: number,
    rotY: number,
    glassMat: THREE.Material,
    frameMat: THREE.Material
  ): void {
    const win = new THREE.Group();
    win.position.set(x, y, z);
    win.rotation.y = rotY;

    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 1.85), glassMat);
    win.add(pane);

    const arch = new THREE.Mesh(new THREE.CircleGeometry(0.825, 20, 0, Math.PI), glassMat);
    arch.position.y = 0.925;
    win.add(arch);

    const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.065, 2.65, 0.08), frameMat);
    mullionV.position.set(0, 0.4, 0.02);
    win.add(mullionV);

    const transom = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.07, 0.09), frameMat);
    transom.position.set(0, 0.92, 0.02);
    win.add(transom);

    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.1, 0.16), frameMat);
    sill.position.set(0, -0.95, 0.04);
    win.add(sill);

    grp.add(win);
  }

  private buildHidingSpots(): void {
    const iron = this.mats.getMaterial('dark_iron');
    const cloth = this.mats.getMaterial('surgical_cloth');

    for (const hs of HIDING_SPOTS) {
      this.hidingSpots.set(hs.id, hs);
      const grp = this.roomGroups.get(hs.roomId) ?? this.root;
      if (hs.kind === 'locker') {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.15, 0.85), iron);
        mesh.position.set(hs.hideCameraPos.x, hs.pos.y + 1.08, hs.hideCameraPos.z);
        mesh.castShadow = true;
        grp.add(mesh);
      } else if (hs.kind === 'curtain_alcove') {
        const curtain = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 1.7), cloth);
        curtain.position.set(hs.pos.x - 0.55, hs.pos.y + 1.1, hs.pos.z);
        grp.add(curtain);
      }
    }
  }

  private buildInteractablesAndSupports(): void {
    const brass = this.mats.getMaterial('tarnished_brass');
    const iron = this.mats.getMaterial('dark_iron');
    const paper = new THREE.MeshStandardMaterial({ color: 0xe3dac6, roughness: 0.75 });

    for (const def of INTERACTABLES) {
      const grp = new THREE.Group();
      const hlMat = brass.clone();
      let mesh: THREE.Mesh;

      if (def.kind === 'lore_doc') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.46), paper);
        const clip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.08), hlMat);
        clip.position.z = -0.18;
        grp.add(clip);
      } else if (def.kind === 'audio_reel' || def.kind === 'save_recorder') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.16, 0.4), iron);
        const spoolA = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 16), hlMat);
        spoolA.position.set(-0.13, 0.1, -0.04);
        const spoolB = spoolA.clone();
        spoolB.position.set(0.13, 0.1, -0.04);
        grp.add(spoolA, spoolB);
      } else if (def.kind === 'puzzle_station') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.58, 0.3), hlMat);
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.26), hlMat);
      }

      grp.add(mesh);

      if (def.id === 'int_elev_panel_cab') {
        grp.position.set(30.8, 1.3, -4.0);
        this.elevatorCabGroup.add(grp);
      } else {
        grp.position.set(def.pos.x, def.pos.y, def.pos.z);
        const parent = this.roomGroups.get(def.roomId) ?? this.root;
        parent.add(grp);

        this.ensurePhysicalPropSupport(parent, def, iron, brass);
      }

      this.interactables.set(def.id, {
        def,
        mesh: grp,
        collected: false,
        highlightMats: [hlMat],
      });
    }
  }

  private ensurePhysicalPropSupport(
    parent: THREE.Group,
    def: InteractableDef,
    iron: THREE.Material,
    brass: THREE.Material
  ): void {
    const room = ROOMS.find((r) => r.id === def.roomId);
    const floorY = room ? (def.roomId === 'R26' && def.pos.x < -22 ? -11.5 : room.bounds.minY) : FLOOR_ELEVATIONS[def.floor];
    const heightAboveFloor = def.pos.y - floorY;
    if (heightAboveFloor < 0.25) return;

    if (def.id === 'int_shortcut3_hatch' || def.id === 'int_shortcut3_top') {
      return; // Mounted directly on the physical Shortcut 3 steel ladder & hatch rail
    }

    if (room) {
      const b = room.bounds;
      const nearWall =
        Math.abs(def.pos.x - b.minX) < 0.65 ||
        Math.abs(def.pos.x - b.maxX) < 0.65 ||
        Math.abs(def.pos.z - b.minZ) < 0.65 ||
        Math.abs(def.pos.z - b.maxZ) < 0.65;
      if (nearWall && def.kind !== 'lore_doc' && def.kind !== 'pickup_item') {
        return;
      }
    }

    for (const c of this.staticColliders) {
      if (
        def.pos.x >= c.minX - 0.2 &&
        def.pos.x <= c.maxX + 0.2 &&
        def.pos.z >= c.minZ - 0.2 &&
        def.pos.z <= c.maxZ + 0.2 &&
        Math.abs(c.maxY - def.pos.y) < 0.22
      ) {
        return;
      }
    }

    const topY = def.pos.y - 0.03;
    const standH = Math.max(0.2, topY - floorY);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.56), brass);
    tray.position.set(def.pos.x, topY, def.pos.z);
    parent.add(tray);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, standH, 10), iron);
    stem.position.set(def.pos.x, floorY + standH * 0.5, def.pos.z);
    parent.add(stem);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.06, 14), iron);
    base.position.set(def.pos.x, floorY + 0.03, def.pos.z);
    parent.add(base);
  }

  private buildSignpostingConduitsAndPipes(): void {
    const yellow = this.mats.getMaterial('conduit_yellow');
    const red = this.mats.getMaterial('steam_pipe_red');

    const g1 = this.roomGroups.get('R05')!;
    this.addSolidBox(g1, 9.0, 20.85, 2.75, 2.88, 6.7, 6.85, yellow, false);
    this.addSolidBox(g1, 20.72, 20.88, 1.3, 2.88, 5.0, 6.85, yellow, false);
    this.addSolidBox(g1, 14.0, 21.0, 3.05, 3.22, 4.7, 4.9, red, false);

    const b2 = this.roomGroups.get('R22')!;
    this.addSolidBox(b2, -14.5, -6.0, -8.0, -7.85, -17.6, -17.45, yellow, false);
  }

  private buildRainParticles(): void {
    const positions: number[] = [];
    for (let i = 0; i < 240; i++) {
      const rx = -37 + ((i * 73) % 150) * 0.1;
      const ry = -11 + ((i * 29) % 90) * 0.12;
      const rz = -39 + ((i * 43) % 120) * 0.1;
      positions.push(rx, ry, rz, rx - 0.08, ry - 0.65, rz);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.rainLines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x9ec0d8, transparent: true, opacity: 0.42 })
    );
    this.root.add(this.rainLines);
  }

  private resolveRoomMaterials(room: RoomDef): {
    floorMat: THREE.Material;
    wallMat: THREE.Material;
    ceilMat: THREE.Material;
  } {
    const w = Math.max(1, Math.round((room.bounds.maxX - room.bounds.minX) / 4));
    const d = Math.max(1, Math.round((room.bounds.maxZ - room.bounds.minZ) / 4));

    switch (room.zone) {
      case 'G1_SANATORIUM':
        return {
          floorMat: this.mats.getMaterial('terrazzo_wet', w, d),
          wallMat: this.mats.getMaterial('celadon_wainscot', w, 1),
          ceilMat: this.mats.getMaterial('brutalist_concrete', w, d),
        };
      case 'G2_SURGICAL':
        return {
          floorMat: this.mats.getMaterial(room.id === 'R12' ? 'walnut_panel' : 'surgical_tile', w, d),
          wallMat: this.mats.getMaterial(room.id === 'R12' ? 'walnut_panel' : 'celadon_wainscot', w, 1),
          ceilMat: this.mats.getMaterial('brutalist_concrete', w, d),
        };
      case 'B1_ARCHIVE':
        return {
          floorMat: this.mats.getMaterial('brutalist_concrete', w, d),
          wallMat: this.mats.getMaterial('brutalist_concrete', w, 1),
          ceilMat: this.mats.getMaterial('dark_iron'),
        };
      case 'B2_ANECHOIC':
        return {
          floorMat: this.mats.getMaterial('steel_grate', w * 2, d * 2),
          wallMat: this.mats.getMaterial('anechoic_wedge', w * 2, 2),
          ceilMat: this.mats.getMaterial('anechoic_wedge', w, d),
        };
      case 'B3_SUBSTATION':
        return {
          floorMat: this.mats.getMaterial('steel_grate', w * 2, d * 2),
          wallMat: this.mats.getMaterial('brutalist_concrete', w, 1),
          ceilMat: this.mats.getMaterial('dark_iron'),
        };
      case 'COURTYARD_DAWN':
        return {
          floorMat: this.mats.getMaterial('culvert_brick', w * 2, d),
          wallMat: this.mats.getMaterial('culvert_brick', w * 2, 2),
          ceilMat: this.mats.getMaterial('culvert_brick', w, d),
        };
    }
  }

  private addZonePointLight(
    _grp: THREE.Group,
    floor: FloorId,
    roomId: string,
    x: number,
    y: number,
    z: number,
    color: number,
    intensity: number,
    distance: number,
    isStrobe = false
  ): void {
    this.virtualLights.push({
      x,
      y,
      z,
      color,
      baseIntensity: intensity,
      distance,
      decay: 1.25,
      floor,
      roomId,
      isStrobe,
      castsShadowAnchor: false,
    });
  }

  private addRoomLightingAndPlaque(grp: THREE.Group, room: RoomDef, w: number, _h: number, d: number): void {
    const cx = (room.bounds.minX + room.bounds.maxX) * 0.5;
    const cz = (room.bounds.minZ + room.bounds.maxZ) * 0.5;
    const lightY = room.id === 'R02' ? 7.8 : room.id === 'R26' ? -6.5 : room.bounds.maxY - 0.45;

    let color = 0xffcf8b;
    let intensity = 3.8;
    let dist = Math.max(w, d) * 1.65;
    const castsShadow = ['R02', 'R09', 'R14', 'R18', 'R24', 'R25'].includes(room.id);

    if (room.id === 'R10') {
      color = 0xe03b35;
      intensity = 4.2;
    } else if (room.zone === 'G2_SURGICAL') {
      color = 0xe2f4ee;
      intensity = 3.8;
    } else if (room.zone === 'B1_ARCHIVE') {
      color = 0xf0a33e;
      intensity = 3.9;
    } else if (room.id === 'R18') {
      color = 0xdcb46e;
      intensity = 6.2;
      dist = 26;
    } else if (room.zone === 'B2_ANECHOIC') {
      color = 0x62d2e0;
      intensity = 3.9;
    } else if (room.zone === 'B3_SUBSTATION') {
      color = 0x64d6eb;
      intensity = 4.6;
      dist = 24;
    } else if (room.zone === 'COURTYARD_DAWN') {
      color = 0xbcd8f0;
      intensity = 7.2;
      dist = 40;
    }

    this.virtualLights.push({
      x: cx,
      y: lightY,
      z: cz,
      color,
      baseIntensity: intensity,
      distance: dist,
      decay: 1.25,
      floor: room.floor,
      roomId: room.id,
      isStrobe: false,
      castsShadowAnchor: castsShadow,
    });

    if (room.id !== 'R26') {
      const fixture = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.28, 0.14, 12),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.3 })
      );
      fixture.position.set(cx, lightY + 0.18, cz);
      grp.add(fixture);
    }

    if (room.id === 'R02') {
      this.addZonePointLight(grp, 'G1', 'R02', 0, 8.6, 0, 0x6398c2, 4.6, 24);
    }

    const plaqueTex = this.mats.makePlaqueTexture(room.code, room.name.slice(0, 28));
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 0.48),
      new THREE.MeshStandardMaterial({
        map: plaqueTex,
        emissiveMap: plaqueTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.4,
      })
    );
    plaque.position.set(cx, room.bounds.minY + 2.15, room.bounds.minZ + 0.16);
    grp.add(plaque);
  }

  private addSlab(
    grp: THREE.Group,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
    mat: THREE.Material,
    collide: boolean
  ): void {
    this.addSolidBox(grp, minX, maxX, minY, maxY, minZ, maxZ, mat, collide, false, false);
  }

  private addSolidBox(
    grp: THREE.Group,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
    mat: THREE.Material,
    collide = true,
    blocksLOS = false,
    castShadow = false
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ),
      mat
    );
    mesh.position.set((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
    mesh.receiveShadow = true;
    mesh.castShadow = castShadow;
    grp.add(mesh);
    if (collide) {
      this.staticColliders.push({ minX, maxX, minY, maxY, minZ, maxZ, blocksLOS });
    }
    return mesh;
  }

  private buildStaticBatches(): void {
    this.root.updateMatrixWorld(true);

    const excluded = new Set<THREE.Object3D>();
    const markSubtreeExcluded = (obj: THREE.Object3D | null) => {
      if (!obj) return;
      obj.traverse((n) => excluded.add(n));
    };
    for (const r of this.brassRings) markSubtreeExcluded(r);
    for (const r of this.waterRippleRings) markSubtreeExcluded(r);
    markSubtreeExcluded(this.steamJetMesh);
    markSubtreeExcluded(this.vaultBlastDoorMesh);
    markSubtreeExcluded(this.porticoFireGateMesh);
    markSubtreeExcluded(this.shortcut3HatchPivot);
    for (const it of this.interactables.values()) markSubtreeExcluded(it.mesh);

    const targetGroups: THREE.Group[] = [...this.roomGroups.values()];
    if (this.stairGroup) targetGroups.push(this.stairGroup);

    for (const grp of targetGroups) {
      const invGrpWorld = grp.matrixWorld.clone().invert();
      const candidates: THREE.Mesh[] = [];

      grp.traverse((node) => {
        if (excluded.has(node)) return;
        const maybeMesh = node as THREE.Mesh;
        if (!maybeMesh.isMesh) return;
        if ((maybeMesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
        if (Array.isArray(maybeMesh.material)) return;
        const g = maybeMesh.geometry;
        const pos = g.getAttribute('position');
        const norm = g.getAttribute('normal');
        const uv = g.getAttribute('uv');
        if (!pos || !norm || !uv || pos.itemSize !== 3 || norm.itemSize !== 3 || uv.itemSize !== 2) return;
        candidates.push(maybeMesh);
      });

      const buckets = new Map<
        string,
        { mat: THREE.Material; cast: boolean; receive: boolean; meshes: THREE.Mesh[] }
      >();
      for (const m of candidates) {
        const mat = m.material as THREE.Material;
        const key = `${mat.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}`;
        let b = buckets.get(key);
        if (!b) {
          b = { mat, cast: m.castShadow, receive: m.receiveShadow, meshes: [] };
          buckets.set(key, b);
        }
        b.meshes.push(m);
      }

      const unbatched = new THREE.Group();
      unbatched.name = `${grp.name}_unbatched`;
      const batched = new THREE.Group();
      batched.name = `${grp.name}_batched`;
      let mergedAny = false;

      for (const b of buckets.values()) {
        if (b.meshes.length < 2) continue;
        mergedAny = true;

        let totalVerts = 0;
        let totalIndices = 0;
        const transformedGeos: THREE.BufferGeometry[] = [];

        for (const m of b.meshes) {
          const relMat = invGrpWorld.clone().multiply(m.matrixWorld);
          const gClone = m.geometry.clone();
          gClone.applyMatrix4(relMat);
          const vCount = gClone.getAttribute('position').count;
          const idxAttr = gClone.getIndex();
          totalVerts += vCount;
          totalIndices += idxAttr ? idxAttr.count : vCount;
          transformedGeos.push(gClone);
        }

        const posArr = new Float32Array(totalVerts * 3);
        const normArr = new Float32Array(totalVerts * 3);
        const uvArr = new Float32Array(totalVerts * 2);
        const idxArr = new Uint32Array(totalIndices);

        let vOffset = 0;
        let iOffset = 0;
        for (const tg of transformedGeos) {
          const p = tg.getAttribute('position');
          const n = tg.getAttribute('normal');
          const u = tg.getAttribute('uv');
          const vCount = p.count;

          for (let k = 0; k < vCount; k++) {
            posArr[(vOffset + k) * 3] = p.getX(k);
            posArr[(vOffset + k) * 3 + 1] = p.getY(k);
            posArr[(vOffset + k) * 3 + 2] = p.getZ(k);
            normArr[(vOffset + k) * 3] = n.getX(k);
            normArr[(vOffset + k) * 3 + 1] = n.getY(k);
            normArr[(vOffset + k) * 3 + 2] = n.getZ(k);
            uvArr[(vOffset + k) * 2] = u.getX(k);
            uvArr[(vOffset + k) * 2 + 1] = u.getY(k);
          }

          const idx = tg.getIndex();
          if (idx) {
            for (let k = 0; k < idx.count; k++) {
              idxArr[iOffset + k] = idx.getX(k) + vOffset;
            }
            iOffset += idx.count;
          } else {
            for (let k = 0; k < vCount; k++) {
              idxArr[iOffset + k] = vOffset + k;
            }
            iOffset += vCount;
          }
          vOffset += vCount;
          tg.dispose();
        }

        const mergedGeo = new THREE.BufferGeometry();
        mergedGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
        mergedGeo.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
        mergedGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
        mergedGeo.setIndex(new THREE.BufferAttribute(idxArr, 1));
        mergedGeo.computeBoundingSphere();

        const mergedMesh = new THREE.Mesh(mergedGeo, b.mat);
        mergedMesh.castShadow = b.cast;
        mergedMesh.receiveShadow = b.receive;
        batched.add(mergedMesh);

        for (const m of b.meshes) {
          const relMat = invGrpWorld.clone().multiply(m.matrixWorld);
          m.parent?.remove(m);
          m.position.set(0, 0, 0);
          m.rotation.set(0, 0, 0);
          m.scale.set(1, 1, 1);
          m.applyMatrix4(relMat);
          unbatched.add(m);
        }
      }

      if (mergedAny) {
        batched.visible = this.optimizationEnabled;
        unbatched.visible = !this.optimizationEnabled;
        grp.add(batched);
        grp.add(unbatched);
        this.batchToggles.push({ unbatched, batched });
      }
    }
  }
}
