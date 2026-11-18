import * as THREE from 'three';
import { ItemDef } from '../core/types';
import { ProceduralMaterialLibrary } from '../assets/proceduralTextures';

export class ItemExaminer3D {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private pivot: THREE.Group;
  private mats: ProceduralMaterialLibrary;
  private currentItem: ItemDef | null = null;
  private hasFlag: (flag: string) => boolean;
  private onSecretDiscovered: (flag: string, message: string) => void;
  private onRotationStateChange: (() => void) | null = null;
  private activeFuseTopCap: THREE.Mesh | null = null;
  private disposableGeometries: THREE.BufferGeometry[] = [];
  private disposableMaterials: THREE.Material[] = [];
  private zoom = 2.35;

  constructor(
    mats: ProceduralMaterialLibrary,
    hasFlag: (flag: string) => boolean,
    onSecretDiscovered: (flag: string, message: string) => void
  ) {
    this.mats = mats;
    this.hasFlag = hasFlag;
    this.onSecretDiscovered = onSecretDiscovered;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121918);

    this.camera = new THREE.PerspectiveCamera(42, 480 / 320, 0.1, 20);
    this.camera.position.set(0, 0.1, this.zoom);

    // Direct camera-aligned inspection lamp so front, rear, and end-cap engravings are brightly lit at every angle!
    const cameraLamp = new THREE.PointLight(0xfff4de, 3.1, 12, 1.1);
    cameraLamp.position.set(0.35, 0.45, 0.6);
    this.camera.add(cameraLamp);
    this.scene.add(this.camera);

    const keyLight = new THREE.DirectionalLight(0xffe6bd, 2.5);
    keyLight.position.set(2.4, 3.1, 3.6);
    this.scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x7fd2db, 1.8, 10);
    rimLight.position.set(-2.5, -1.2, -1.6);
    this.scene.add(rimLight);

    const fill = new THREE.HemisphereLight(0xd9d2be, 0x3b4541, 1.25);
    this.scene.add(fill);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
  }

  public mountToContainer(
    container: HTMLElement,
    item: ItemDef,
    onRotationStateChange?: () => void
  ): void {
    this.currentItem = item;
    this.onRotationStateChange = onRotationStateChange ?? null;
    container.innerHTML = '';

    const width = Math.max(320, container.clientWidth || 480);
    const height = Math.max(240, container.clientHeight || 300);

    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.22;
    }
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    container.appendChild(this.renderer.domElement);

    this.rebuildItemMesh(item);
    this.pivot.rotation.set(0.22, -0.35, 0);
    this.zoom = 2.3;
    this.camera.position.set(0, 0.08, this.zoom);
    this.renderFrame();

    let dragging = false;
    let prevX = 0;
    let prevY = 0;

    const canvas = this.renderer.domElement;
    canvas.onpointerdown = (ev: PointerEvent) => {
      dragging = true;
      prevX = ev.clientX;
      prevY = ev.clientY;
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        // Ignore in synthetic events
      }
    };
    canvas.onpointermove = (ev: PointerEvent) => {
      if (!dragging) return;
      const dx = ev.clientX - prevX;
      const dy = ev.clientY - prevY;
      prevX = ev.clientX;
      prevY = ev.clientY;
      this.rotateBy(dx * 0.012, dy * 0.012);
    };
    canvas.onpointerup = () => {
      dragging = false;
    };
    canvas.onpointercancel = () => {
      dragging = false;
    };
    canvas.onwheel = (ev: WheelEvent) => {
      ev.preventDefault();
      this.zoom = Math.min(3.6, Math.max(1.35, this.zoom + ev.deltaY * 0.002));
      this.camera.position.z = this.zoom;
      this.renderFrame();
    };
  }

  public rotateBy(dYaw: number, dPitch: number): void {
    this.pivot.rotation.y += dYaw;
    this.pivot.rotation.x = Math.max(-Math.PI * 0.85, Math.min(Math.PI * 0.85, this.pivot.rotation.x + dPitch));
    this.checkAngleSecrets();
    this.renderFrame();
    if (this.onRotationStateChange) {
      this.onRotationStateChange();
    }
  }

  public renderFrame(): void {
    if (!this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }

  public disposeCurrentItemResources(): void {
    this.activeFuseTopCap = null;
    while (this.pivot.children.length > 0) {
      this.pivot.remove(this.pivot.children[0]);
    }
    for (const g of this.disposableGeometries) {
      g.dispose();
    }
    this.disposableGeometries.length = 0;
    for (const m of this.disposableMaterials) {
      m.dispose();
    }
    this.disposableMaterials.length = 0;
  }

  private checkAngleSecrets(): void {
    if (!this.currentItem || !this.currentItem.examineSecretFlag || !this.currentItem.examineSecretText) return;
    const flag = this.currentItem.examineSecretFlag;
    if (this.hasFlag(flag)) return;

    const normY = Math.atan2(Math.sin(this.pivot.rotation.y), Math.cos(this.pivot.rotation.y));
    const lookingAtBack = Math.abs(normY) > 2.15 || Math.abs(this.pivot.rotation.x) > 1.35;

    if (lookingAtBack) {
      this.onSecretDiscovered(flag, this.currentItem.examineSecretText);
      // Visually slide the unthreaded brass ferrule cap axially along the porcelain core when unthreaded!
      if (flag === 'fuse_holder_unthreaded' && this.activeFuseTopCap) {
        this.activeFuseTopCap.position.y = 0.72;
      }
    }
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.disposableGeometries.push(g);
    return g;
  }

  private trackMat<T extends THREE.Material>(m: T): T {
    this.disposableMaterials.push(m);
    return m;
  }

  private rebuildItemMesh(item: ItemDef): void {
    this.disposeCurrentItemResources();

    const brass = this.mats.getMaterial('tarnished_brass');
    const iron = this.mats.getMaterial('dark_iron');
    const porcelain = this.mats.getMaterial('porcelain_white');
    const satinBrass = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xc8a45c, roughness: 0.36, metalness: 0.35 })
    );

    switch (item.examinerModel) {
      case 'pocket_watch': {
        const body = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.68, 0.68, 0.18, 44)), satinBrass);
        body.rotation.x = Math.PI / 2;
        this.pivot.add(body);

        const rim = new THREE.Mesh(this.trackGeo(new THREE.TorusGeometry(0.66, 0.035, 14, 44)), satinBrass);
        rim.position.z = 0.08;
        this.pivot.add(rim);

        const crown = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 16)), satinBrass);
        crown.position.set(0, 0.78, 0);
        this.pivot.add(crown);

        const bow = new THREE.Mesh(this.trackGeo(new THREE.TorusGeometry(0.18, 0.03, 12, 24)), satinBrass);
        bow.position.set(0, 0.9, 0);
        this.pivot.add(bow);

        const faceTex = this.mats.makeEngravedBrassTexture(['ST. DAMIAN', 'XII', 'STOPPED 03:14', 'B. HALDANE']);
        const face = new THREE.Mesh(
          this.trackGeo(new THREE.CircleGeometry(0.61, 40)),
          this.trackMat(
            new THREE.MeshStandardMaterial({
              map: faceTex,
              emissiveMap: faceTex,
              emissive: 0xffe8ba,
              emissiveIntensity: 0.2,
              roughness: 0.32,
              metalness: 0.22,
            })
          )
        );
        face.position.z = 0.096;
        this.pivot.add(face);

        const backTex = this.mats.makeEngravedBrassTexture([
          'RADIOLOGY SAFE',
          'PAIR CLAMP #',
          'WITH SUFFIX:',
          '— 47 —',
        ]);
        const back = new THREE.Mesh(
          this.trackGeo(new THREE.CircleGeometry(0.63, 40)),
          this.trackMat(
            new THREE.MeshStandardMaterial({
              map: backTex,
              emissiveMap: backTex,
              emissive: 0xffe8ba,
              emissiveIntensity: 0.24,
              roughness: 0.34,
              metalness: 0.24,
            })
          )
        );
        back.position.z = -0.096;
        back.rotation.y = Math.PI;
        this.pivot.add(back);
        break;
      }
      case 'fuse_holder':
      case 'restored_fuse': {
        // Coaxial assembly built cleanly along local Y axis, then tilted -45 deg as one rigid unit (UI-03 fix!)
        const assembly = new THREE.Group();
        assembly.rotation.z = -Math.PI / 4;

        const core = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.26, 0.26, 1.06, 28)), porcelain);
        assembly.add(core);

        // Exposed threaded silver contact terminal at top end of porcelain barrel
        const terminal = new THREE.Mesh(
          this.trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.24, 20)),
          this.trackMat(new THREE.MeshStandardMaterial({ color: 0xdbe3e6, roughness: 0.28, metalness: 0.55 }))
        );
        terminal.position.y = 0.56;
        assembly.add(terminal);

        const capGeo = this.trackGeo(new THREE.CylinderGeometry(0.3, 0.3, 0.26, 28));
        const capBottom = new THREE.Mesh(capGeo, satinBrass);
        capBottom.position.y = -0.46;
        assembly.add(capBottom);

        const isUnthreaded =
          item.examinerModel === 'fuse_holder' && this.hasFlag('fuse_holder_unthreaded');
        const capTop = new THREE.Mesh(capGeo, satinBrass);
        capTop.position.y = isUnthreaded ? 0.72 : 0.46;
        assembly.add(capTop);
        this.activeFuseTopCap = capTop;

        const stampTex = this.mats.makeEngravedBrassTexture(
          item.examinerModel === 'restored_fuse'
            ? ['30A SILVER', 'CALIBRATED', 'READY FOR B3']
            : ['30A CARTRIDGE', 'ROTATE END-CAP', 'TO UNTHREAD']
        );
        const stampMat = this.trackMat(
          new THREE.MeshStandardMaterial({
            map: stampTex,
            emissiveMap: stampTex,
            emissive: 0xffe8ba,
            emissiveIntensity: 0.22,
            roughness: 0.34,
            metalness: 0.24,
          })
        );

        // Rear/side inspection collar plaque + coaxial end-cap face
        const collarPlaque = new THREE.Mesh(this.trackGeo(new THREE.CircleGeometry(0.27, 28)), stampMat);
        collarPlaque.position.set(0, 0, -0.27);
        collarPlaque.rotation.y = Math.PI;
        assembly.add(collarPlaque);

        const bottomStamp = new THREE.Mesh(this.trackGeo(new THREE.CircleGeometry(0.28, 28)), stampMat);
        bottomStamp.position.y = -0.595;
        bottomStamp.rotation.x = Math.PI / 2;
        assembly.add(bottomStamp);

        this.pivot.add(assembly);
        break;
      }
      case 'lux_meter': {
        const box = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.75, 1.05, 0.44)), iron);
        this.pivot.add(box);
        const bezel = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.28, 0.24, 0.16, 28)), satinBrass);
        bezel.rotation.x = Math.PI / 2;
        bezel.position.set(0, 0.2, 0.26);
        this.pivot.add(bezel);
        const crank = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.08, 0.42, 0.08)), satinBrass);
        crank.position.set(0.42, -0.1, 0);
        this.pivot.add(crank);
        const dialTex = this.mats.makeLuxDialTexture();
        const dial = new THREE.Mesh(
          this.trackGeo(new THREE.CircleGeometry(0.24, 28)),
          this.trackMat(
            new THREE.MeshStandardMaterial({
              map: dialTex,
              emissiveMap: dialTex,
              emissive: 0xffffff,
              emissiveIntensity: 0.55,
            })
          )
        );
        dial.position.set(0, -0.22, 0.23);
        this.pivot.add(dial);
        break;
      }
      case 'xray_plate': {
        const isBed11 = item.id === 'xray_plate_b';
        const label = item.id === 'xray_plate_a' ? 'BED 04 - KESTREL' : isBed11 ? 'BED 11 - J. VANE' : 'BED 17 - MERCER';
        const tex = this.mats.makeXRayTexture(label, isBed11 ? '19' : undefined);
        const plate = new THREE.Mesh(
          this.trackGeo(new THREE.BoxGeometry(0.95, 1.25, 0.03)),
          this.trackMat(
            new THREE.MeshStandardMaterial({
              map: tex,
              emissiveMap: tex,
              emissive: 0x8be4f0,
              emissiveIntensity: 0.55,
              roughness: 0.18,
            })
          )
        );
        this.pivot.add(plate);
        break;
      }
      case 'reel_hub':
      case 'tape_spool':
      case 'calibration_reel': {
        const flGeo = this.trackGeo(new THREE.CylinderGeometry(0.66, 0.66, 0.04, 32));
        const flangeA = new THREE.Mesh(flGeo, satinBrass);
        flangeA.rotation.x = Math.PI / 2;
        flangeA.position.z = 0.08;
        this.pivot.add(flangeA);
        const flangeB = new THREE.Mesh(flGeo, satinBrass);
        flangeB.rotation.x = Math.PI / 2;
        flangeB.position.z = -0.08;
        this.pivot.add(flangeB);
        if (item.examinerModel !== 'reel_hub') {
          const tape = new THREE.Mesh(
            this.trackGeo(new THREE.CylinderGeometry(0.54, 0.54, 0.12, 32)),
            this.trackMat(new THREE.MeshStandardMaterial({ color: 0x3b2318, roughness: 0.45 }))
          );
          tape.rotation.x = Math.PI / 2;
          this.pivot.add(tape);
        }
        break;
      }
      case 'service_key': {
        const shaft = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 16)), satinBrass);
        shaft.rotation.z = Math.PI / 2;
        this.pivot.add(shaft);
        const bow = new THREE.Mesh(this.trackGeo(new THREE.TorusGeometry(0.22, 0.045, 12, 24)), satinBrass);
        bow.position.x = -0.58;
        this.pivot.add(bow);
        const bit = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.22, 0.24, 0.05)), satinBrass);
        bit.position.set(0.36, -0.14, 0);
        this.pivot.add(bit);
        break;
      }
      default: {
        const glassMat = this.mats.getMaterial('frosted_glass');
        const cyl = new THREE.Mesh(
          this.trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.85, 24)),
          item.id === 'glass_vial' ? glassMat : brass
        );
        this.pivot.add(cyl);
        const cap = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 24)), iron);
        cap.position.y = 0.46;
        this.pivot.add(cap);
        break;
      }
    }
  }
}
