import * as THREE from 'three';
import { AABB, FloorId, GameSettings, HidingSpotDef, RoomDef, Vec3 } from '../core/types';
import { BROKEN_GLASS_PATCHES, ROOMS, STAIR_RAMPS } from '../world/worldData';

export interface PlayerInputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  crouchHeld: boolean;
  leanLeft: boolean;
  leanRight: boolean;
}

export class PlayerController {
  public pos: Vec3 = { x: 0, y: 0, z: 13.2 };
  public vel: Vec3 = { x: 0, y: 0, z: 0 };
  public yaw = 0;
  public pitch = 0;

  public isCrouching = false;
  public crouchBlend = 0;
  public leanAmount = 0;
  public stamina = 100;
  public health = 2;
  public hiddenSpot: HidingSpotDef | null = null;
  public distanceWalked = 0;
  public lastKnownSafeRoom: RoomDef = ROOMS[0];

  private readonly radius = 0.34;
  private readonly standHeight = 1.72;
  private readonly crouchHeight = 0.96;
  private readonly standEye = 1.58;
  private readonly crouchEye = 0.86;
  private readonly maxStepUp = 0.42;

  private bobTimer = 0;
  private footstepAccum = 0;
  private crouchToggled = false;
  private shakeIntensity = 0;
  public boardedElevator = false;
  private lastElevatorY: number | null = null;

  public triggerCameraShake(amount: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, amount);
  }

  public toggleCrouch(): void {
    this.crouchToggled = !this.crouchToggled;
  }

  public enterHiding(spot: HidingSpotDef): void {
    this.hiddenSpot = spot;
    this.yaw = spot.facingYaw;
    this.pitch = 0;
    this.vel = { x: 0, y: 0, z: 0 };
  }

  public exitHiding(): void {
    if (!this.hiddenSpot) return;
    this.pos = { ...this.hiddenSpot.pos };
    this.hiddenSpot = null;
  }

  public enforceLookConstraints(): void {
    this.pitch = Math.max(-1.42, Math.min(1.42, this.pitch));
    if (this.hiddenSpot) {
      const diff = Math.atan2(
        Math.sin(this.yaw - this.hiddenSpot.facingYaw),
        Math.cos(this.yaw - this.hiddenSpot.facingYaw)
      );
      const clamped = Math.max(-0.52, Math.min(0.52, diff));
      this.yaw = this.hiddenSpot.facingYaw + clamped;
      this.pitch = Math.max(-0.45, Math.min(0.45, this.pitch));
    }
  }

  public applyLookDelta(dx: number, dy: number, settings: GameSettings): void {
    const sens = 0.0022 * settings.mouseSensitivity;
    const inv = settings.invertY ? -1 : 1;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens * inv;
    this.enforceLookConstraints();
  }

  public applyKeyboardLook(turnDelta: number, pitchDelta: number): void {
    this.yaw += turnDelta;
    this.pitch += pitchDelta;
    this.enforceLookConstraints();
  }

  public syncElevatorAttachment(elevatorY: number): void {
    this.lastElevatorY = elevatorY;
    this.boardedElevator =
      this.pos.x >= 28.45 &&
      this.pos.x <= 31.55 &&
      this.pos.z >= -5.5 &&
      this.pos.z <= -2.5 &&
      Math.abs(this.pos.y - elevatorY) <= 0.45;
  }

  public unstuckToSafeEntry(): RoomDef {
    this.hiddenSpot = null;
    this.boardedElevator = false;
    const room = this.resolveCurrentRoom();
    this.pos = { ...room.safeEntry };
    this.vel = { x: 0, y: 0, z: 0 };
    return room;
  }

  public resolveCurrentRoom(): RoomDef {
    const r26 = ROOMS.find((r) => r.id === 'R26')!;
    if (
      this.pos.x <= r26.bounds.maxX + 0.15 &&
      this.pos.x >= r26.bounds.minX - 0.5 &&
      this.pos.z >= r26.bounds.minZ - 0.5 &&
      this.pos.z <= r26.bounds.maxZ + 0.5 &&
      this.pos.y <= -9.5
    ) {
      this.lastKnownSafeRoom = r26;
      return r26;
    }

    for (const r of ROOMS) {
      if (r.id === 'R26') continue;
      const b = r.bounds;
      if (
        this.pos.x >= b.minX - 0.3 &&
        this.pos.x <= b.maxX + 0.3 &&
        this.pos.z >= b.minZ - 0.3 &&
        this.pos.z <= b.maxZ + 0.3 &&
        this.pos.y >= b.minY - 1.1 &&
        this.pos.y <= b.maxY + 0.4
      ) {
        if (r.id === 'R02' && this.pos.y >= 3.8) continue;
        if (r.id === 'R18' && this.pos.y >= -6.2) continue;
        this.lastKnownSafeRoom = r;
        return r;
      }
    }

    let best = this.lastKnownSafeRoom;
    let bestDist = Infinity;
    for (const r of ROOMS) {
      const cx = (r.bounds.minX + r.bounds.maxX) * 0.5;
      const cy = r.bounds.minY;
      const cz = (r.bounds.minZ + r.bounds.maxZ) * 0.5;
      const d = Math.hypot(this.pos.x - cx, (this.pos.y - cy) * 2.2, this.pos.z - cz);
      if (d < bestDist) {
        bestDist = d;
        best = r;
      }
    }
    return best;
  }

  public resolveFloor(): FloorId {
    const room = this.resolveCurrentRoom();
    if (room.id === 'R26') return 'B3';
    const b = room.bounds;
    if (this.pos.y >= b.minY - 0.9 && this.pos.y <= b.maxY + 0.4) {
      return room.floor;
    }
    if (this.pos.y >= 3.0) return 'G2';
    if (this.pos.y >= -2.8) return 'G1';
    if (this.pos.y >= -8.4) return 'B1';
    if (this.pos.y >= -13.8) return 'B2';
    return 'B3';
  }

  public update(
    dt: number,
    input: PlayerInputState,
    colliders: AABB[],
    elevatorY: number,
    settings: GameSettings,
    camera: THREE.PerspectiveCamera,
    onFootstep: (surface: 'terrazzo' | 'puddle' | 'grate' | 'glass' | 'crouch', loudness: number) => void
  ): { sprintingNow: boolean } {
    this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.5);

    // Continuous platform rider attachment ONLY when already boarded on cab floor
    const inCabXZ =
      this.pos.x >= 28.45 && this.pos.x <= 31.55 && this.pos.z >= -5.5 && this.pos.z <= -2.5;
    if (this.boardedElevator && inCabXZ && this.lastElevatorY !== null) {
      const cabDelta = elevatorY - this.lastElevatorY;
      if (Math.abs(cabDelta) < 1.2 && Math.abs(this.pos.y - this.lastElevatorY) <= 0.48) {
        this.pos.y += cabDelta;
      }
    }
    this.lastElevatorY = elevatorY;

    if (this.hiddenSpot) {
      this.enforceLookConstraints();
      camera.position.set(
        this.hiddenSpot.hideCameraPos.x,
        this.hiddenSpot.hideCameraPos.y,
        this.hiddenSpot.hideCameraPos.z
      );
      camera.rotation.order = 'YXZ';
      camera.rotation.y = this.yaw;
      camera.rotation.x = this.pitch;
      camera.rotation.z = 0;
      this.stamina = Math.min(100, this.stamina + dt * 22);
      return { sprintingNow: false };
    }

    const wantsCrouch = input.crouchHeld || this.crouchToggled;
    if (wantsCrouch) {
      this.isCrouching = true;
    } else if (this.isCrouching && this.canStandUp(colliders)) {
      this.isCrouching = false;
    }
    this.crouchBlend = THREE.MathUtils.lerp(this.crouchBlend, this.isCrouching ? 1 : 0, Math.min(1, dt * 12));

    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let moveX = 0;
    let moveZ = 0;
    if (input.forward) {
      moveX += forwardX;
      moveZ += forwardZ;
    }
    if (input.backward) {
      moveX -= forwardX;
      moveZ -= forwardZ;
    }
    if (input.right) {
      moveX += rightX;
      moveZ += rightZ;
    }
    if (input.left) {
      moveX -= rightX;
      moveZ -= rightZ;
    }

    const moveLen = Math.hypot(moveX, moveZ);
    const moving = moveLen > 0.01;
    if (moving) {
      moveX /= moveLen;
      moveZ /= moveLen;
    }

    const canSprint = moving && input.sprint && !this.isCrouching && this.stamina > 6;
    if (canSprint) {
      this.stamina = Math.max(0, this.stamina - dt * 24);
    } else {
      this.stamina = Math.min(100, this.stamina + dt * 17);
    }

    let speed = this.isCrouching ? 2.05 : canSprint ? 5.65 : 3.65;
    if (this.health === 1) {
      speed *= 0.8;
    }

    const prevX = this.pos.x;
    const prevZ = this.pos.z;

    const capsuleH = this.isCrouching ? this.crouchHeight : this.standHeight;
    const dx = moveX * speed * dt;
    const dz = moveZ * speed * dt;

    this.pos.x += dx;
    this.resolveHorizontalCollisions(colliders, capsuleH);
    this.pos.z += dz;
    this.resolveHorizontalCollisions(colliders, capsuleH);

    // R4-PHYSICS-02 (S1) fix: Strict contact-limited support acquisition (never pulls upward > maxStepUp 0.42m!)
    const supportY = this.computeFloorSupportY(this.pos.x, this.pos.z, this.pos.y, colliders, elevatorY);
    if (
      supportY > -28 &&
      supportY <= this.pos.y + this.maxStepUp &&
      this.pos.y <= supportY + 0.52 &&
      this.vel.y <= 0.01
    ) {
      this.pos.y = THREE.MathUtils.lerp(this.pos.y, supportY, Math.min(1, dt * 24));
      this.vel.y = 0;
    } else {
      this.vel.y -= 18 * dt;
      this.pos.y += this.vel.y * dt;
      if (supportY > -28 && this.pos.y <= supportY && supportY <= this.pos.y - this.vel.y * dt + this.maxStepUp) {
        this.pos.y = supportY;
        this.vel.y = 0;
      }
      if (this.pos.y < -23.0) {
        this.unstuckToSafeEntry();
      }
    }

    this.boardedElevator =
      this.pos.x >= 28.45 &&
      this.pos.x <= 31.55 &&
      this.pos.z >= -5.5 &&
      this.pos.z <= -2.5 &&
      Math.abs(this.pos.y - elevatorY) <= 0.45;

    const stepDist = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
    this.distanceWalked += stepDist;

    if (stepDist > 0.001) {
      this.footstepAccum += stepDist;
      const stride = canSprint ? 1.55 : this.isCrouching ? 1.45 : 1.75;
      if (this.footstepAccum >= stride) {
        this.footstepAccum = 0;
        const surface = this.detectSurface();
        const loudness =
          surface === 'glass' ? 18 : canSprint ? 15 : surface === 'puddle' ? 9.5 : this.isCrouching ? 2.2 : 6.0;
        onFootstep(surface, loudness);
      }
      this.bobTimer += dt * (canSprint ? 11.5 : 7.5);
    }

    const targetLean = (input.leanRight ? 1 : 0) - (input.leanLeft ? 1 : 0);
    this.leanAmount = THREE.MathUtils.lerp(this.leanAmount, targetLean, Math.min(1, dt * 10));

    const eyeY = THREE.MathUtils.lerp(this.standEye, this.crouchEye, this.crouchBlend);
    const bobOffset =
      settings.disableHeadBob || !moving ? 0 : Math.sin(this.bobTimer) * (canSprint ? 0.045 : 0.024);
    const shakeFactor = settings.reduceCameraShake ? 0.25 : 1.0;
    const shakeOffset =
      this.shakeIntensity > 0 ? Math.sin(performance.now() * 0.045) * 0.03 * this.shakeIntensity * shakeFactor : 0;

    const originX = this.pos.x;
    const originY = this.pos.y + eyeY + bobOffset;
    const originZ = this.pos.z;
    const desiredOffsetX = rightX * this.leanAmount * 0.36 + shakeOffset;
    const desiredOffsetZ = rightZ * this.leanAmount * 0.36;

    // R5-INPUT-02 fix: Continuous segment/expanded-AABB sweep prevents clipping into or through thin panes/walls
    const safeScale = this.clampEyeDisplacement(
      originX,
      originY,
      originZ,
      desiredOffsetX,
      0,
      desiredOffsetZ,
      0.12,
      colliders
    );

    camera.position.set(
      originX + desiredOffsetX * safeScale,
      originY,
      originZ + desiredOffsetZ * safeScale
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch;
    camera.rotation.z = -this.leanAmount * safeScale * 0.085;

    return { sprintingNow: canSprint };
  }

  private detectSurface(): 'terrazzo' | 'puddle' | 'grate' | 'glass' | 'crouch' {
    for (const g of BROKEN_GLASS_PATCHES) {
      if (Math.abs(this.pos.y - g.x * 0 - g.y) < 0.8 && Math.hypot(this.pos.x - g.x, this.pos.z - g.z) < g.radius) {
        return 'glass';
      }
    }
    if (this.isCrouching) return 'crouch';
    const room = this.resolveCurrentRoom();
    if (room.id === 'R05' || room.id === 'R23') return 'puddle';
    if (room.floor === 'B2' || (room.floor === 'B3' && room.id !== 'R26')) return 'grate';
    return 'terrazzo';
  }

  // Public contact-limited support query (also called directly by qa-admissions-support.mjs)
  public computeFloorSupportY(
    x: number,
    z: number,
    currentY: number,
    colliders: AABB[],
    elevatorY: number
  ): number {
    let bestY = -30.0;

    // 1. Freight Elevator Cab floor: ONLY when feet are within realistic step/contact band [-0.52m, +0.42m]
    if (
      x >= 28.45 &&
      x <= 31.55 &&
      z >= -5.5 &&
      z <= -2.5 &&
      elevatorY <= currentY + this.maxStepUp &&
      elevatorY >= currentY - 0.52
    ) {
      bestY = Math.max(bestY, elevatorY);
    }

    // 2. Stair & Culvert Ramps: ONLY when ramp surface at (x, z) is within realistic contact/step band [-0.62m, +0.42m]
    for (const sr of STAIR_RAMPS) {
      if (x >= sr.minX && x <= sr.maxX && z >= sr.minZ && z <= sr.maxZ) {
        const t = sr.axis === 'z' ? (z - sr.minZ) / (sr.maxZ - sr.minZ) : (x - sr.minX) / (sr.maxX - sr.minX);
        const rampY = THREE.MathUtils.lerp(sr.yStart, sr.yEnd, Math.max(0, Math.min(1, t)));
        if (rampY <= currentY + this.maxStepUp && rampY >= currentY - 0.62) {
          bestY = Math.max(bestY, rampY);
        }
      }
    }

    // 3. Solid Floor Slab Colliders at or below step height (+0.42m)
    for (const c of colliders) {
      if (x + 0.18 > c.minX && x - 0.18 < c.maxX && z + 0.18 > c.minZ && z - 0.18 < c.maxZ) {
        if (c.maxY <= currentY + this.maxStepUp && c.maxY > bestY) {
          bestY = c.maxY;
        }
      }
    }

    return bestY;
  }

  private resolveHorizontalCollisions(colliders: AABB[], height: number): void {
    const footY = this.pos.y + 0.42;
    const headY = this.pos.y + height;

    for (const c of colliders) {
      if (c.maxY <= footY || c.minY >= headY) continue;

      const closestX = Math.max(c.minX, Math.min(this.pos.x, c.maxX));
      const closestZ = Math.max(c.minZ, Math.min(this.pos.z, c.maxZ));
      const dx = this.pos.x - closestX;
      const dz = this.pos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < this.radius * this.radius) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const push = this.radius - dist;
          this.pos.x += (dx / dist) * push;
          this.pos.z += (dz / dist) * push;
        } else {
          const penLeft = Math.abs(this.pos.x - c.minX);
          const penRight = Math.abs(c.maxX - this.pos.x);
          const penNorth = Math.abs(this.pos.z - c.minZ);
          const penSouth = Math.abs(c.maxZ - this.pos.z);
          const minPen = Math.min(penLeft, penRight, penNorth, penSouth);
          if (minPen === penLeft) this.pos.x = c.minX - this.radius;
          else if (minPen === penRight) this.pos.x = c.maxX + this.radius;
          else if (minPen === penNorth) this.pos.z = c.minZ - this.radius;
          else this.pos.z = c.maxZ + this.radius;
        }
      }
    }
  }

  private canStandUp(colliders: AABB[]): boolean {
    const lowY = this.pos.y + this.crouchHeight;
    const highY = this.pos.y + this.standHeight;
    for (const c of colliders) {
      if (c.maxY <= lowY || c.minY >= highY) continue;
      if (
        this.pos.x + this.radius * 0.85 > c.minX &&
        this.pos.x - this.radius * 0.85 < c.maxX &&
        this.pos.z + this.radius * 0.85 > c.minZ &&
        this.pos.z - this.radius * 0.85 < c.maxZ
      ) {
        return false;
      }
    }
    return true;
  }

  private clampEyeDisplacement(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    eyeClearance: number,
    colliders: AABB[]
  ): number {
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-5) return 1.0;
    let allowedFraction = 1.0;

    for (const c of colliders) {
      const minX = c.minX - eyeClearance;
      const maxX = c.maxX + eyeClearance;
      const minY = c.minY - eyeClearance;
      const maxY = c.maxY + eyeClearance;
      const minZ = c.minZ - eyeClearance;
      const maxZ = c.maxZ + eyeClearance;

      let tmin = 0.0;
      let tmax = 1.0;
      let hit = true;
      const slabs: Array<[number, number, number, number]> = [
        [ox, dx, minX, maxX],
        [oy, dy, minY, maxY],
        [oz, dz, minZ, maxZ],
      ];
      for (const [orig, delta, bMin, bMax] of slabs) {
        if (Math.abs(delta) < 1e-8) {
          if (orig < bMin || orig > bMax) {
            hit = false;
            break;
          }
        } else {
          let t1 = (bMin - orig) / delta;
          let t2 = (bMax - orig) / delta;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
          }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) {
            hit = false;
            break;
          }
        }
      }

      if (hit && tmin <= allowedFraction && tmax >= 0) {
        const safeT = Math.max(0, tmin - 0.015);
        if (safeT < allowedFraction) {
          allowedFraction = safeT;
        }
      }
    }

    return allowedFraction;
  }
}
