import * as THREE from 'three';
import { AABB, CantorState, FloorId, LampMode, Vec3 } from '../core/types';
import { CANTOR_NAV_GRAPHS, CANTOR_PATROL_LOOPS, NavNode, ROOMS } from '../world/worldData';
import { ProceduralMaterialLibrary } from '../assets/proceduralTextures';
import { DoorRuntime } from '../world/worldBuilder';

export class CantorAISystem {
  public active = false;
  public state: CantorState = 'PATROL';
  public pos: Vec3 = { x: 14.0, y: 0, z: -4.0 };
  public yaw = 0;
  public floor: FloorId = 'G1';
  public targetPos: Vec3 = { x: 14.0, y: 0, z: -4.0 };
  public hasLOS = false;
  public awareness = 0;
  public doorBashTimer = 0;
  public lastStimulus = 'none';
  public playerEnteredHideInLOS = false;

  public readonly meshGroup = new THREE.Group();
  public readonly rigLight = new THREE.PointLight(0xd97b29, 0, 5.8, 1.35);
  private thoracicRings: THREE.Mesh[] = [];
  private leftHipPivot = new THREE.Group();
  private leftKneePivot = new THREE.Group();
  private rightHipPivot = new THREE.Group();
  private rightKneePivot = new THREE.Group();
  private torsoPivot = new THREE.Group();
  private headPivot = new THREE.Group();
  private leftArmPivot = new THREE.Group();
  private leftElbowPivot = new THREE.Group();
  private rightArmPivot = new THREE.Group();
  private rightElbowPivot = new THREE.Group();
  private walkPhase = 0;

  private patrolLoopIndex = 0;
  private investigateTimer = 0;
  private cooldownTimer = 0;
  private decoyCommitTimer = 0;
  private attackCooldown = 0;
  private activeBashDoorId: string | null = null;

  private navPath: NavNode[] = [];
  private navCursor = 0;
  private navGoalId: string | null = null;
  private navLastGoalPos: Vec3 | null = null;
  private navProgressRefPos: Vec3 = { x: 0, y: 0, z: 0 };
  private navStuckTimer = 0;

  constructor(mats: ProceduralMaterialLibrary) {
    this.buildCantorMesh(mats);
    this.meshGroup.visible = false;
  }

  public spawnOnFloor(floor: FloorId, loopStartIdx = 0): void {
    const nodes = CANTOR_NAV_GRAPHS[floor] ?? CANTOR_NAV_GRAPHS.B1;
    const loop = CANTOR_PATROL_LOOPS[floor] ?? CANTOR_PATROL_LOOPS.B1;
    const startId = loop[loopStartIdx % loop.length];
    const startNode = nodes.find((n) => n.id === startId) ?? nodes[0];
    const nextId = loop[(loopStartIdx + 1) % loop.length];
    const nextNode = nodes.find((n) => n.id === nextId) ?? startNode;

    this.floor = floor;
    this.pos = { x: startNode.x, y: startNode.y, z: startNode.z };
    this.targetPos = { x: nextNode.x, y: nextNode.y, z: nextNode.z };
    this.patrolLoopIndex = (loopStartIdx + 1) % loop.length;
    this.state = 'PATROL';
    this.awareness = 0;
    this.investigateTimer = 0;
    this.cooldownTimer = 0;
    this.decoyCommitTimer = 0;
    this.doorBashTimer = 0;
    this.activeBashDoorId = null;
    this.playerEnteredHideInLOS = false;
    this.walkPhase = 0;
    this.clearCachedPath();
    this.active = true;
    this.meshGroup.visible = true;
    this.syncMesh(0, 0);
  }

  public clearCachedPath(): void {
    this.navPath = [];
    this.navCursor = 0;
    this.navGoalId = null;
    this.navLastGoalPos = null;
    this.navStuckTimer = 0;
  }

  public deactivate(): void {
    this.active = false;
    this.meshGroup.visible = false;
    this.rigLight.intensity = 0;
    this.clearCachedPath();
  }

  public sealInContainmentVault(): void {
    this.state = 'TRAPPED';
    this.pos = { x: 0, y: -16.5, z: -34.2 };
    this.targetPos = { ...this.pos };
    this.clearCachedPath();
    this.syncMesh(0, 0);
  }

  public isInsideContainmentVault(): boolean {
    return (
      this.active &&
      this.floor === 'B3' &&
      Math.abs(this.pos.x) < 2.75 &&
      this.pos.z <= -31.65 &&
      this.pos.z >= -36.8
    );
  }

  public notifyPlayerEnteredHiding(playerPos: Vec3, colliders: AABB[]): void {
    if (!this.active || this.state === 'TRAPPED') {
      this.playerEnteredHideInLOS = false;
      return;
    }
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const sameFloor = Math.abs(playerPos.y - this.pos.y) < 2.6;
    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    const dot = dist > 0.01 ? (dx / dist) * forwardX + (dz / dist) * forwardZ : 1;

    const inVisionCone = dot > 0.45 || dist < 1.8;
    const clearLOS = sameFloor && dist < 12.5 && inVisionCone && !this.segmentOccluded(this.pos, playerPos, colliders);

    this.playerEnteredHideInLOS = clearLOS;
    if (this.playerEnteredHideInLOS) {
      this.state = 'CHASE';
      this.targetPos = { ...playerPos };
      this.lastStimulus = 'saw_hiding_entry';
    }
  }

  public emitAcousticStimulus(sourcePos: Vec3, radius: number, label: string, highPriorityDecoy = false): void {
    if (!this.active || this.state === 'TRAPPED') return;
    if (Math.abs(sourcePos.y - this.pos.y) > 3.4) return;

    const dist = Math.hypot(sourcePos.x - this.pos.x, sourcePos.z - this.pos.z);
    if (dist > radius) return;

    this.lastStimulus = label;
    if (highPriorityDecoy) {
      this.targetPos = { ...sourcePos };
      this.state = 'INVESTIGATE';
      this.investigateTimer = 14.0;
      this.decoyCommitTimer = 5.0;
      this.awareness = Math.min(this.awareness, 55);
      return;
    }

    if (this.decoyCommitTimer > 0) return;

    if (this.state !== 'CHASE') {
      this.targetPos = { ...sourcePos };
      this.state = 'INVESTIGATE';
      this.investigateTimer = 12.0;
      this.awareness = Math.min(100, this.awareness + 42);
      if (dist < 4.2 && radius >= 15) {
        this.state = 'CHASE';
        this.awareness = 100;
      }
    } else {
      this.targetPos = { ...sourcePos };
    }
  }

  public update(
    dt: number,
    elapsed: number,
    playerPos: Vec3,
    playerFloor: FloorId,
    playerRoomSafeHaven: boolean,
    playerHidden: boolean,
    playerCrouched: boolean,
    lampMode: LampMode,
    colliders: AABB[],
    doors: Map<string, DoorRuntime>,
    onDoorBash: (doorId: string) => void,
    onAttackHitPlayer: () => void
  ): { occluded: boolean; distance: number } {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.decoyCommitTimer = Math.max(0, this.decoyCommitTimer - dt);

    if (!this.active) {
      this.meshGroup.visible = false;
      this.rigLight.intensity = 0;
      return { occluded: true, distance: 999 };
    }
    this.meshGroup.visible = true;

    if (this.state === 'TRAPPED') {
      this.syncMesh(elapsed, 0);
      const dTrap = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      return { occluded: true, distance: dTrap };
    }

    if (
      this.floor !== playerFloor &&
      !playerRoomSafeHaven &&
      (playerFloor === 'B1' || playerFloor === 'B2' || playerFloor === 'B3')
    ) {
      const nodes = CANTOR_NAV_GRAPHS[playerFloor];
      const loop = CANTOR_PATROL_LOOPS[playerFloor];
      if (nodes && loop) {
        let bestIdx = 0;
        let maxD = -1;
        loop.forEach((id, idx) => {
          const n = nodes.find((nd) => nd.id === id);
          if (!n) return;
          const d = Math.hypot(n.x - playerPos.x, n.z - playerPos.z);
          if (d > maxD) {
            maxD = d;
            bestIdx = idx;
          }
        });
        if (maxD > 7.0) {
          this.spawnOnFloor(playerFloor, bestIdx);
        }
      }
    }

    const dx = playerPos.x - this.pos.x;
    const dy = playerPos.y - this.pos.y;
    const dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dy * 1.4, dz);
    const sameElevation = Math.abs(dy) < 2.8;
    const occluded = !sameElevation || this.segmentOccluded(this.pos, playerPos, colliders);

    if (playerRoomSafeHaven) {
      this.hasLOS = false;
      if (this.state === 'CHASE' || (this.state === 'INVESTIGATE' && this.decoyCommitTimer <= 0)) {
        this.state = 'COOLDOWN';
        this.cooldownTimer = 4.0;
      }
    } else if (this.decoyCommitTimer <= 0 || dist < 1.35) {
      const forwardX = Math.sin(this.yaw);
      const forwardZ = Math.cos(this.yaw);
      const flatDist = Math.hypot(dx, dz) || 1;
      const dot = (dx / flatDist) * forwardX + (dz / flatDist) * forwardZ;

      let sightRange = lampMode === 1 ? 16.5 : lampMode === 2 ? 6.8 : 4.6;
      if (playerCrouched) sightRange *= 0.68;

      const inCone = dot > (lampMode === 1 ? 0.25 : 0.45) || flatDist < 1.85;
      const visibleNow =
        sameElevation && !occluded && (!playerHidden || this.playerEnteredHideInLOS) && flatDist <= sightRange && inCone;
      this.hasLOS = visibleNow;

      if (visibleNow) {
        const gainRate = lampMode === 1 ? 135 : flatDist < 4.5 ? 120 : 68;
        this.awareness = Math.min(100, this.awareness + dt * gainRate);
        this.targetPos = { ...playerPos };
        this.lastStimulus = lampMode === 1 ? 'tungsten_beam' : 'visual_silhouette';
        if (this.awareness >= 75 || flatDist < 4.5) {
          this.state = 'CHASE';
        } else if (this.state === 'PATROL') {
          this.state = 'INVESTIGATE';
          this.investigateTimer = 10.5;
        }
      } else {
        this.awareness = Math.max(0, this.awareness - dt * 16);
      }
    } else {
      this.hasLOS = false;
    }

    let moveSpeed = 2.1;
    switch (this.state) {
      case 'PATROL': {
        moveSpeed = 2.1;
        this.clearCachedPath();
        const nodes = CANTOR_NAV_GRAPHS[this.floor] ?? CANTOR_NAV_GRAPHS.B1;
        const loop = CANTOR_PATROL_LOOPS[this.floor] ?? CANTOR_PATROL_LOOPS.B1;
        const wpId = loop[this.patrolLoopIndex % loop.length];
        const wp = nodes.find((n) => n.id === wpId) ?? nodes[0];
        this.targetPos = { x: wp.x, y: wp.y, z: wp.z };
        if (Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.65) {
          this.patrolLoopIndex = (this.patrolLoopIndex + 1) % loop.length;
        }
        break;
      }
      case 'INVESTIGATE': {
        moveSpeed = 3.15;
        this.investigateTimer -= dt;
        if (Math.hypot(this.targetPos.x - this.pos.x, this.targetPos.z - this.pos.z) < 0.55) {
          this.yaw += dt * 1.65;
        }
        if (this.investigateTimer <= 0) {
          this.state = 'COOLDOWN';
          this.cooldownTimer = 3.5;
          this.clearCachedPath();
        }
        break;
      }
      case 'CHASE': {
        moveSpeed = 4.62;
        if (this.hasLOS) {
          this.targetPos = { ...playerPos };
          this.investigateTimer = 5.5;
        } else {
          this.investigateTimer -= dt;
          if (this.investigateTimer <= 0) {
            this.state = 'INVESTIGATE';
            this.investigateTimer = 7.0;
            this.playerEnteredHideInLOS = false;
          }
        }

        if (
          sameElevation &&
          !occluded &&
          dist < 1.48 &&
          this.attackCooldown <= 0 &&
          !playerRoomSafeHaven
        ) {
          if (!playerHidden || this.playerEnteredHideInLOS) {
            this.attackCooldown = 3.2;
            this.playerEnteredHideInLOS = false;
            onAttackHitPlayer();
          }
        }
        break;
      }
      case 'COOLDOWN': {
        moveSpeed = 1.95;
        this.cooldownTimer -= dt;
        const nodes = CANTOR_NAV_GRAPHS[this.floor] ?? CANTOR_NAV_GRAPHS.B1;
        const loop = CANTOR_PATROL_LOOPS[this.floor] ?? CANTOR_PATROL_LOOPS.B1;
        const wpId = loop[this.patrolLoopIndex % loop.length];
        const wp = nodes.find((n) => n.id === wpId) ?? nodes[0];
        this.targetPos = { x: wp.x, y: wp.y, z: wp.z };
        if (this.cooldownTimer <= 0) {
          this.state = 'PATROL';
          this.clearCachedPath();
        }
        break;
      }
    }

    const steerPoint =
      this.state === 'PATROL'
        ? this.targetPos
        : this.computePersistentSteerWaypoint(dt, this.targetPos, colliders, doors);

    const blockingDoor = this.findBlockingClosedDoor(steerPoint, doors);
    if (blockingDoor) {
      const isSafeHavenDoor =
        blockingDoor.def.id === 'D12' || blockingDoor.def.id === 'D14' || blockingDoor.def.id === 'D01';
      if (isSafeHavenDoor || !blockingDoor.isUnlocked) {
        this.activeBashDoorId = null;
        this.doorBashTimer = 0;
        this.state = 'COOLDOWN';
        this.cooldownTimer = 3.0;
        this.patrolLoopIndex++;
        this.clearCachedPath();
        this.syncMesh(elapsed, 0);
        return { occluded, distance: dist };
      }

      if (this.activeBashDoorId !== blockingDoor.def.id) {
        this.activeBashDoorId = blockingDoor.def.id;
        this.doorBashTimer = 2.5;
        blockingDoor.bashShake = 1.0;
        onDoorBash(blockingDoor.def.id);
      } else {
        this.doorBashTimer -= dt;
        blockingDoor.bashShake = 0.75;
        if (this.doorBashTimer <= 0) {
          blockingDoor.isOpen = true;
          blockingDoor.openProgress = 1.0;
          blockingDoor.collider.minY = -9999;
          blockingDoor.collider.maxY = -9998;
          blockingDoor.collider.blocksLOS = false;
          this.activeBashDoorId = null;
          this.doorBashTimer = 0;
          onDoorBash(blockingDoor.def.id);
        }
      }
      this.syncMesh(elapsed, 0);
      return { occluded, distance: dist };
    } else {
      this.activeBashDoorId = null;
      this.doorBashTimer = 0;
    }

    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    const toX = steerPoint.x - this.pos.x;
    const toZ = steerPoint.z - this.pos.z;
    const toLen = Math.hypot(toX, toZ);
    if (toLen > 0.08) {
      const stepDist = Math.min(toLen, moveSpeed * dt);
      const stepX = (toX / toLen) * stepDist;
      const stepZ = (toZ / toLen) * stepDist;
      this.yaw = Math.atan2(toX, toZ);

      const nextX = this.pos.x + stepX;
      const nextZ = this.pos.z + stepZ;

      if (!this.hitsSafeHaven(nextX, this.pos.y, nextZ)) {
        if (!this.circleHitsCollider(nextX, this.pos.y, this.pos.z, colliders)) {
          this.pos.x = nextX;
        }
        if (!this.circleHitsCollider(this.pos.x, this.pos.y, nextZ, colliders)) {
          this.pos.z = nextZ;
        }
      }
    }

    const movedSpeed = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ) / Math.max(0.001, dt);
    this.walkPhase += Math.hypot(this.pos.x - prevX, this.pos.z - prevZ) * 3.1;
    this.syncMesh(elapsed, movedSpeed);
    return { occluded, distance: dist };
  }

  private computePersistentSteerWaypoint(
    dt: number,
    goal: Vec3,
    colliders: AABB[],
    doors: Map<string, DoorRuntime>
  ): Vec3 {
    const wallOnlyBlockers = colliders.filter((c) => {
      if (!c.blocksLOS) return false;
      if (c.doorId) {
        const d = doors.get(c.doorId);
        if (d && d.isUnlocked && d.def.id !== 'D12' && d.def.id !== 'D14') return false;
      }
      return true;
    });

    if (!this.corridorSegmentBlocked(this.pos, goal, wallOnlyBlockers)) {
      this.clearCachedPath();
      return goal;
    }

    const nodes = CANTOR_NAV_GRAPHS[this.floor];
    if (!nodes || nodes.length === 0) return goal;

    const findBestVisibleNode = (p: Vec3): NavNode => {
      let bestVisible: NavNode | null = null;
      let bestVisDist = Infinity;
      let bestAny = nodes[0];
      let bestAnyDist = Infinity;

      for (const n of nodes) {
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (d < bestAnyDist) {
          bestAnyDist = d;
          bestAny = n;
        }
        if (d < bestVisDist && !this.segmentOccluded(p, n, wallOnlyBlockers)) {
          bestVisDist = d;
          bestVisible = n;
        }
      }
      return bestVisible ?? bestAny;
    };

    const goalNode = findBestVisibleNode(goal);

    if (!this.activeBashDoorId) {
      if (Math.hypot(this.pos.x - this.navProgressRefPos.x, this.pos.z - this.navProgressRefPos.z) > 0.22) {
        this.navProgressRefPos = { ...this.pos };
        this.navStuckTimer = 0;
      } else {
        this.navStuckTimer += dt;
      }
    }

    const goalMovedFar =
      !this.navLastGoalPos ||
      Math.hypot(goal.x - this.navLastGoalPos.x, goal.z - this.navLastGoalPos.z) > 2.2;

    const needsReplan =
      this.navPath.length === 0 ||
      this.navCursor >= this.navPath.length ||
      this.navGoalId !== goalNode.id ||
      (goalMovedFar && this.navGoalId !== goalNode.id) ||
      this.navStuckTimer > 1.5;

    if (needsReplan) {
      this.navStuckTimer = 0;
      this.navLastGoalPos = { ...goal };
      this.navGoalId = goalNode.id;

      const currentActiveNode =
        this.navPath.length > 0 && this.navCursor < this.navPath.length
          ? this.navPath[this.navCursor]
          : null;
      const startNode =
        currentActiveNode && !this.segmentOccluded(this.pos, currentActiveNode, wallOnlyBlockers)
          ? currentActiveNode
          : findBestVisibleNode(this.pos);

      this.navPath = this.runBFS(nodes, startNode, goalNode, doors);
      this.navCursor = 0;
      if (
        this.navPath.length >= 2 &&
        (Math.hypot(this.navPath[0].x - this.pos.x, this.navPath[0].z - this.pos.z) < 0.55 ||
          !this.corridorSegmentBlocked(this.pos, this.navPath[1], wallOnlyBlockers))
      ) {
        this.navCursor = 1;
      }
    }

    while (this.navCursor < this.navPath.length) {
      const wp = this.navPath[this.navCursor];
      if (Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.48) {
        this.navCursor++;
      } else {
        break;
      }
    }

    if (this.navCursor >= this.navPath.length) {
      return goal;
    }

    const currentWp = this.navPath[this.navCursor];
    return { x: currentWp.x, y: currentWp.y, z: currentWp.z };
  }

  private runBFS(
    nodes: NavNode[],
    startNode: NavNode,
    goalNode: NavNode,
    doors: Map<string, DoorRuntime>
  ): NavNode[] {
    if (startNode.id === goalNode.id) return [startNode];

    const nodeBlockedByLockedDoor = (n: NavNode): boolean => {
      for (const d of doors.values()) {
        if (!d.isOpen && !d.isUnlocked && Math.abs(d.def.y - n.y) < 1.5) {
          if (Math.hypot(d.def.x - n.x, d.def.z - n.z) < 0.55) return true;
        }
      }
      return false;
    };

    const queue: string[] = [startNode.id];
    const parent = new Map<string, string>();
    const visited = new Set<string>([startNode.id]);

    while (queue.length > 0) {
      const curId = queue.shift()!;
      if (curId === goalNode.id) break;
      const curNode = nodes.find((n) => n.id === curId);
      if (!curNode) continue;
      for (const nbId of curNode.neighbors) {
        if (visited.has(nbId)) continue;
        const nbNode = nodes.find((n) => n.id === nbId);
        if (!nbNode || nodeBlockedByLockedDoor(nbNode)) continue;
        visited.add(nbId);
        parent.set(nbId, curId);
        queue.push(nbId);
      }
    }

    if (!visited.has(goalNode.id)) return [startNode];

    const path: NavNode[] = [];
    let trace: string | undefined = goalNode.id;
    while (trace) {
      const n = nodes.find((nd) => nd.id === trace);
      if (n) path.unshift(n);
      trace = parent.get(trace);
    }
    return path;
  }

  private corridorSegmentBlocked(a: Vec3, b: Vec3, blockers: AABB[]): boolean {
    if (this.segmentOccluded(a, b, blockers)) return true;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return false;
    const px = (-dz / len) * 0.32;
    const pz = (dx / len) * 0.32;
    if (
      this.segmentOccluded({ x: a.x + px, y: a.y, z: a.z + pz }, { x: b.x + px, y: b.y, z: b.z + pz }, blockers)
    ) {
      return true;
    }
    if (
      this.segmentOccluded({ x: a.x - px, y: a.y, z: a.z - pz }, { x: b.x - px, y: b.y, z: b.z - pz }, blockers)
    ) {
      return true;
    }
    return false;
  }

  private findBlockingClosedDoor(steer: Vec3, doors: Map<string, DoorRuntime>): DoorRuntime | null {
    const dirX = steer.x - this.pos.x;
    const dirZ = steer.z - this.pos.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;

    for (const d of doors.values()) {
      if (d.isOpen || Math.abs(d.def.y - this.pos.y) > 1.6) continue;
      const toDoorX = d.def.x - this.pos.x;
      const toDoorZ = d.def.z - this.pos.z;
      const dist = Math.hypot(toDoorX, toDoorZ);
      if (dist < 1.15) {
        const dot = (toDoorX / (dist || 1)) * nx + (toDoorZ / (dist || 1)) * nz;
        if (dot > 0.15 || dist < 0.75) {
          return d;
        }
      }
    }
    return null;
  }

  private hitsSafeHaven(x: number, y: number, z: number): boolean {
    for (const r of ROOMS) {
      if (!r.safeHaven) continue;
      const b = r.bounds;
      if (
        x > b.minX - 0.3 &&
        x < b.maxX + 0.3 &&
        z > b.minZ - 0.3 &&
        z < b.maxZ + 0.3 &&
        y >= b.minY - 0.8 &&
        y <= b.maxY
      ) {
        return true;
      }
    }
    return false;
  }

  private circleHitsCollider(x: number, y: number, z: number, colliders: AABB[]): boolean {
    const r = 0.36;
    for (const c of colliders) {
      if (c.maxY <= y + 0.45 || c.minY >= y + 1.9) continue;
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) {
        return true;
      }
    }
    return false;
  }

  public segmentOccluded(a: Vec3, b: Vec3, colliders: AABB[]): boolean {
    const ax = a.x;
    const ay = a.y + 1.45;
    const az = a.z;
    const bx = b.x;
    const by = b.y + 1.35;
    const bz = b.z;

    for (const c of colliders) {
      if (!c.blocksLOS) continue;
      if (this.rayIntersectsAABB(ax, ay, az, bx, by, bz, c)) {
        return true;
      }
    }
    return false;
  }

  private rayIntersectsAABB(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    box: AABB
  ): boolean {
    let tmin = 0;
    let tmax = 1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;

    const axes: Array<[number, number, number, number]> = [
      [x0, dx, box.minX, box.maxX],
      [y0, dy, box.minY, box.maxY],
      [z0, dz, box.minZ, box.maxZ],
    ];

    for (const [orig, dir, minB, maxB] of axes) {
      if (Math.abs(dir) < 1e-6) {
        if (orig < minB || orig > maxB) return false;
      } else {
        let t1 = (minB - orig) / dir;
        let t2 = (maxB - orig) / dir;
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
    return tmin <= 1 && tmax >= 0;
  }

  // R4-ART-02 fix: Restrained asymmetrical limp, dragging orthopedic brace, hunched thorax, and listening head-tilt animation!
  private syncMesh(elapsed: number, movedSpeed: number): void {
    const strideWeight = Math.min(1.0, movedSpeed / 2.0);
    const s = Math.sin(this.walkPhase);
    const c = Math.cos(this.walkPhase);

    // Asymmetrical limp dip when weight lands on braced right leg
    const limpDip = strideWeight * Math.max(0, -s) * 0.055;
    this.meshGroup.position.set(this.pos.x, this.pos.y - limpDip, this.pos.z);
    this.rigLight.intensity = this.active ? 1.45 : 0;
    this.rigLight.position.set(this.pos.x, this.pos.y + 1.44 - limpDip, this.pos.z);
    this.meshGroup.rotation.order = 'YXZ';
    this.meshGroup.rotation.y = this.yaw;
    this.meshGroup.rotation.z = strideWeight * s * 0.045;

    // Left (unbraced) leg takes full stride; right (orthopedic brace) leg drags stiffly behind!
    this.leftHipPivot.rotation.x = s * 0.46 * strideWeight;
    this.leftKneePivot.rotation.x = Math.max(0, -c) * 0.52 * strideWeight;

    this.rightHipPivot.rotation.x = (-s * 0.24 - 0.1) * strideWeight - 0.04;
    this.rightKneePivot.rotation.x = 0.08 + Math.max(0, c) * 0.14 * strideWeight;

    // Hunched forward thorax with subtle respiratory / resonator heave
    const chaseLean = this.state === 'CHASE' ? 0.28 : 0.17;
    this.torsoPivot.rotation.x = chaseLean + Math.sin(elapsed * 2.8) * 0.025;
    this.torsoPivot.rotation.y = -s * 0.08 * strideWeight;

    // Eerie auditory-tracking head tilt (cocks ear toward corridor when investigating/listening)
    const listenTilt =
      this.state === 'INVESTIGATE'
        ? Math.sin(elapsed * 2.2) * 0.24
        : Math.sin(elapsed * 1.1) * 0.08;
    this.headPivot.rotation.z = listenTilt;
    this.headPivot.rotation.x = 0.12 + Math.cos(elapsed * 1.7) * 0.05;
    this.headPivot.rotation.y = this.state === 'INVESTIGATE' ? Math.cos(elapsed * 1.5) * 0.22 : 0;

    // Long jointed arms: restrained counter-swing in patrol, tense forward reach in chase!
    const chaseReach = this.state === 'CHASE' ? -0.58 : -0.16;
    this.leftArmPivot.rotation.x = chaseReach - s * 0.34 * strideWeight;
    this.leftArmPivot.rotation.z = 0.12;
    this.leftElbowPivot.rotation.x = this.state === 'CHASE' ? -0.55 : -0.38;

    this.rightArmPivot.rotation.x = chaseReach * 0.85 + s * 0.26 * strideWeight;
    this.rightArmPivot.rotation.z = -0.14;
    this.rightElbowPivot.rotation.x = this.state === 'CHASE' ? -0.62 : -0.44;

    this.thoracicRings.forEach((r, idx) => {
      const pulse = 1 + Math.sin(elapsed * (this.state === 'CHASE' ? 20 : 7.5) + idx * 0.9) * 0.038;
      r.scale.set(pulse, 1, pulse);
    });
  }

  // R4-ART-02 fix: Gaunt articulated humanoid Subject 09 ("The Cantor") with separated legs, right surgical brace, leather-brass thoracic resonator rig, jointed arms/hands & bandaged head!
  private buildCantorMesh(mats: ProceduralMaterialLibrary): void {
    const wardSmock = new THREE.MeshStandardMaterial({ color: 0x242c29, roughness: 0.88, metalness: 0.06 });
    const leatherStrap = new THREE.MeshStandardMaterial({ color: 0x362216, roughness: 0.72, metalness: 0.12 });
    const paleSkin = new THREE.MeshStandardMaterial({ color: 0x9b9485, roughness: 0.66, metalness: 0.04 });
    const bandageCloth = mats.getMaterial('surgical_cloth');
    const brass = mats.getMaterial('tarnished_brass');
    const iron = mats.getMaterial('dark_iron');
    const filament = new THREE.MeshStandardMaterial({
      color: 0xffba66,
      emissive: 0xd97324,
      emissiveIntensity: 1.35,
      roughness: 0.25,
    });

    // Shared limb geometries (minimal draw/memory footprint)
    const thighGeo = new THREE.CylinderGeometry(0.074, 0.056, 0.48, 10);
    const shinGeo = new THREE.CylinderGeometry(0.054, 0.038, 0.46, 10);
    const jointGeo = new THREE.SphereGeometry(0.056, 10, 10);
    const footGeo = new THREE.BoxGeometry(0.1, 0.07, 0.23);
    const upperArmGeo = new THREE.CylinderGeometry(0.052, 0.042, 0.4, 10);
    const foreArmGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.38, 10);

    // 1. Narrow gaunt pelvis & sunken waist
    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.2, 12), wardSmock);
    pelvis.position.y = 0.98;
    pelvis.scale.set(1.12, 1, 0.76);
    pelvis.castShadow = true;
    this.meshGroup.add(pelvis);

    const waistBelt = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.155, 0.07, 12), leatherStrap);
    waistBelt.position.y = 1.04;
    waistBelt.scale.set(1.12, 1, 0.78);
    this.meshGroup.add(waistBelt);

    // 2. Left Leg (unbraced gaunt stride leg)
    this.leftHipPivot.position.set(-0.135, 0.94, 0);
    const lThigh = new THREE.Mesh(thighGeo, wardSmock);
    lThigh.position.y = -0.24;
    lThigh.castShadow = true;
    this.leftHipPivot.add(lThigh);

    this.leftKneePivot.position.set(0, -0.47, 0);
    const lKnee = new THREE.Mesh(jointGeo, wardSmock);
    this.leftKneePivot.add(lKnee);
    const lShin = new THREE.Mesh(shinGeo, paleSkin);
    lShin.position.y = -0.23;
    lShin.castShadow = true;
    this.leftKneePivot.add(lShin);
    const lFoot = new THREE.Mesh(footGeo, iron);
    lFoot.position.set(0, -0.44, 0.05);
    this.leftKneePivot.add(lFoot);
    this.leftHipPivot.add(this.leftKneePivot);
    this.meshGroup.add(this.leftHipPivot);

    // 3. Right Leg + Forged-Iron & Brass Orthopedic Dragging Brace
    this.rightHipPivot.position.set(0.145, 0.94, 0);
    const rThigh = new THREE.Mesh(thighGeo, wardSmock);
    rThigh.position.y = -0.24;
    rThigh.castShadow = true;
    this.rightHipPivot.add(rThigh);

    // Outer & inner orthopedic thigh sidebars + leather thigh cuff
    const braceStrutUpper = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.46, 0.036), iron);
    braceStrutUpper.position.set(0.078, -0.23, 0);
    this.rightHipPivot.add(braceStrutUpper);
    const thighCuff = new THREE.Mesh(new THREE.TorusGeometry(0.076, 0.014, 8, 16), leatherStrap);
    thighCuff.rotation.x = Math.PI / 2;
    thighCuff.position.y = -0.2;
    this.rightHipPivot.add(thighCuff);

    this.rightKneePivot.position.set(0, -0.47, 0);
    const caliperHinge = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.14, 12), brass);
    caliperHinge.rotation.z = Math.PI / 2;
    this.rightKneePivot.add(caliperHinge);

    const rShin = new THREE.Mesh(shinGeo, wardSmock);
    rShin.position.y = -0.23;
    rShin.castShadow = true;
    this.rightKneePivot.add(rShin);

    // Twin lower orthopedic caliper rails + brass ankle stirrup + heavy surgical boot
    for (const sideX of [-0.062, 0.074]) {
      const lowRail = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.46, 0.034), iron);
      lowRail.position.set(sideX, -0.23, 0);
      this.rightKneePivot.add(lowRail);
    }
    for (const strapY of [-0.14, -0.32]) {
      const calfStrap = new THREE.Mesh(new THREE.TorusGeometry(0.064, 0.012, 8, 16), brass);
      calfStrap.rotation.x = Math.PI / 2;
      calfStrap.position.y = strapY;
      this.rightKneePivot.add(calfStrap);
    }
    const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.085, 0.25), iron);
    rBoot.position.set(0.01, -0.44, 0.05);
    this.rightKneePivot.add(rBoot);
    this.rightHipPivot.add(this.rightKneePivot);
    this.meshGroup.add(this.rightHipPivot);

    // 4. Hunched Tapered Thorax + Leather-Brass Resonator Harness + Golden Rib Motif
    this.torsoPivot.position.set(0, 1.08, 0);

    // Narrow waist tapering out to gaunt upper ribcage
    const ribcage = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.125, 0.64, 14), wardSmock);
    ribcage.position.y = 0.33;
    ribcage.scale.set(1.16, 1, 0.78);
    ribcage.castShadow = true;
    this.torsoPivot.add(ribcage);

    // Broadened bony clavicle / shoulder yoke
    const clavicle = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.09, 0.18), leatherStrap);
    clavicle.position.set(0, 0.61, 0);
    clavicle.castShadow = true;
    this.torsoPivot.add(clavicle);

    // Crossed surgical leather harness straps across chest & back
    for (const tiltZ of [-0.52, 0.52]) {
      const harness = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.66, 0.22), leatherStrap);
      harness.position.set(0, 0.34, 0);
      harness.rotation.z = tiltZ;
      this.torsoPivot.add(harness);
    }

    // Dorsal iron spinal splint + twin vertical brass acoustic tuning rods on back
    const spineSplint = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.68, 0.05), iron);
    spineSplint.position.set(0, 0.35, -0.13);
    this.torsoPivot.add(spineSplint);
    for (const rx of [-0.09, 0.09]) {
      const tuningRod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.56, 8), brass);
      tuningRod.position.set(rx, 0.46, -0.15);
      this.torsoPivot.add(tuningRod);
    }

    // Retained signature motif: 4 anatomical phosphor-bronze sympathetic ribs + glowing resonator filament core
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.235 - i * 0.014, 0.018, 10, 24), brass);
      rib.rotation.x = Math.PI / 2;
      rib.scale.set(1.12, 0.84, 1);
      rib.position.set(0, 0.18 + i * 0.115, 0.02);
      this.torsoPivot.add(rib);
      this.thoracicRings.push(rib);
    }

    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.4, 12), filament);
    core.position.set(0, 0.35, 0.14);
    this.torsoPivot.add(core);

    // Riveted brass acoustic neck gorget
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.11, 16), brass);
    collar.position.set(0, 0.68, 0.02);
    this.torsoPivot.add(collar);

    // 5. Hunched Neck, Gaunt Skull/Jaw, Stained Ocular Bandage & Brass Tympanic Ear-Horns
    this.headPivot.position.set(0, 0.74, 0.04);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, 0.12, 10), paleSkin);
    neck.position.y = 0.05;
    this.headPivot.add(neck);

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 14), paleSkin);
    cranium.scale.set(0.86, 1.08, 0.98);
    cranium.position.set(0, 0.18, 0.02);
    cranium.castShadow = true;
    this.headPivot.add(cranium);

    const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.058, 0.11, 10), paleSkin);
    jaw.position.set(0, 0.095, 0.045);
    this.headPivot.add(jaw);

    // Surgical linen blindfold wrap across eyes (Julian Vane's post-op optic hemorrhage)
    const blindfold = new THREE.Mesh(new THREE.CylinderGeometry(0.114, 0.112, 0.068, 16), bandageCloth);
    blindfold.scale.set(0.9, 1, 1.02);
    blindfold.position.set(0, 0.19, 0.022);
    blindfold.rotation.z = 0.06;
    this.headPivot.add(blindfold);

    // Twin flared brass tympanic ear-horns / cochlear pickups
    for (const sign of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.095, 12, 1, true), brass);
      horn.position.set(sign * 0.135, 0.18, 0.01);
      horn.rotation.z = sign * (Math.PI / 2);
      this.headPivot.add(horn);
    }
    this.torsoPivot.add(this.headPivot);

    // 6. Long Jointed Left & Right Arms + Elongated Hands
    const buildArm = (
      sideSign: number,
      shoulderPivot: THREE.Group,
      elbowPivot: THREE.Group
    ) => {
      shoulderPivot.position.set(sideSign * 0.285, 0.6, 0);
      const shoulderCap = new THREE.Mesh(jointGeo, leatherStrap);
      shoulderPivot.add(shoulderCap);

      const uArm = new THREE.Mesh(upperArmGeo, wardSmock);
      uArm.position.y = -0.2;
      uArm.castShadow = true;
      shoulderPivot.add(uArm);

      elbowPivot.position.set(0, -0.39, 0);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 8), paleSkin);
      elbowPivot.add(elbow);

      const fArm = new THREE.Mesh(foreArmGeo, paleSkin);
      fArm.position.y = -0.19;
      fArm.castShadow = true;
      elbowPivot.add(fArm);

      const wristShackle = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.06, 10), brass);
      wristShackle.position.y = -0.34;
      elbowPivot.add(wristShackle);

      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.095, 0.075), paleSkin);
      palm.position.set(0, -0.41, 0.01);
      elbowPivot.add(palm);

      // 3 elongated splayed finger prongs
      for (const fz of [-0.024, 0, 0.024]) {
        const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.005, 0.095, 6), paleSkin);
        finger.position.set(sideSign * 0.006, -0.49, fz + 0.015);
        finger.rotation.z = sideSign * 0.12;
        elbowPivot.add(finger);
      }

      shoulderPivot.add(elbowPivot);
      this.torsoPivot.add(shoulderPivot);
    };

    buildArm(-1, this.leftArmPivot, this.leftElbowPivot);
    buildArm(1, this.rightArmPivot, this.rightElbowPivot);

    this.rigLight.castShadow = false;
    this.meshGroup.add(this.torsoPivot);
  }
}
