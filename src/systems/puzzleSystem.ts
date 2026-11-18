import { COMBINATION_RECIPES, ITEMS } from '../world/itemsAndLore';
import { PuzzleRuntimeState } from '../core/types';
import { InteractableRuntime } from '../world/worldBuilder';

export class GameplayStateAndPuzzleSystem {
  public inventory: Record<string, number> = {};
  public collectedLore = new Set<string>();
  public flags = new Set<string>();
  public shortcutsUnlocked = new Set<number>();
  public puzzles: PuzzleRuntimeState;

  constructor(initialPuzzles: PuzzleRuntimeState) {
    this.puzzles = initialPuzzles;
  }

  public addItem(itemId: string, qty = 1): void {
    const def = ITEMS[itemId];
    if (!def) return;
    if (def.stackable) {
      this.inventory[itemId] = (this.inventory[itemId] ?? 0) + qty;
    } else {
      this.inventory[itemId] = 1;
    }
  }

  public hasItem(itemId: string): boolean {
    return (this.inventory[itemId] ?? 0) > 0;
  }

  public getItemCount(itemId: string): number {
    return this.inventory[itemId] ?? 0;
  }

  public consumeItem(itemId: string): boolean {
    const def = ITEMS[itemId];
    if (!def || def.essential) return false;
    const count = this.inventory[itemId] ?? 0;
    if (count <= 0) return false;
    if (count === 1) delete this.inventory[itemId];
    else this.inventory[itemId] = count - 1;
    return true;
  }

  public tryCombine(itemA: string, itemB: string): { ok: boolean; message: string; resultItem?: string } {
    for (const r of COMBINATION_RECIPES) {
      const match = (r.itemA === itemA && r.itemB === itemB) || (r.itemA === itemB && r.itemB === itemA);
      if (!match) continue;
      if (!this.hasItem(r.itemA) || !this.hasItem(r.itemB)) {
        return { ok: false, message: 'Missing required component in inventory.' };
      }
      if (r.requiresFlag && !this.flags.has(r.requiresFlag)) {
        return { ok: false, message: r.requiresHint ?? 'Inspect components in 3D Examiner first.' };
      }
      delete this.inventory[r.itemA];
      delete this.inventory[r.itemB];
      this.inventory[r.resultItem] = 1;
      this.flags.add(r.setsFlag);
      return { ok: true, message: r.message, resultItem: r.resultItem };
    }
    return { ok: false, message: 'These two items do not interface mechanically.' };
  }

  public enforceVialSupplyFloor(interactables: Map<string, InteractableRuntime>): number {
    let worldVials = 0;
    for (const rt of interactables.values()) {
      if (!rt.collected && rt.def.itemId === 'glass_vial') {
        worldVials++;
      }
    }
    const heldVials = this.getItemCount('glass_vial');
    const total = worldVials + heldVials;

    if (total === 0) {
      let respawned = 0;
      for (const id of ['int_vial_g1_east', 'int_vial_b1_corr', 'int_vial_g2_ward']) {
        const rt = interactables.get(id);
        if (rt && rt.collected && respawned < 2) {
          rt.collected = false;
          rt.mesh.visible = true;
          respawned++;
        }
      }
      return respawned;
    }
    return total;
  }

  // R1-001 fix: Exact 3-valve steam calculation (Base 15: V1 +40, V2 +25, V3 -20 = 60 PSI)
  public computeSteamPSI(): number {
    const [v1, v2, v3] = this.puzzles.steamValves;
    let psi = 15;
    if (v1) psi += 40;
    if (v2) psi += 25;
    if (v3) psi -= 20;
    return psi;
  }

  // B3 3-Phase Substation Loads (Target: 40 / 40 / 40 = 120 kW without any phase > 50 kW)
  public computeSubstationPhases(): {
    a: number;
    b: number;
    c: number;
    total: number;
    overloaded: boolean;
    balanced: boolean;
  } {
    const [s1, s2, s3, s4] = this.puzzles.phaseSwitches;
    let a = 0;
    let b = 0;
    let c = 0;
    if (s1) {
      a += 25;
      b += 15;
    }
    if (s2) {
      b += 25;
      c += 25;
    }
    if (s3) {
      a += 15;
      c += 15;
    }
    if (s4) {
      a += 20;
      b += 20;
      c -= 10;
    }
    const total = a + b + c;
    const overloaded = a > 50 || b > 50 || c > 50;
    const balanced = this.puzzles.substationFuseInserted && !overloaded && a === 40 && b === 40 && c === 40;
    return { a, b, c, total, overloaded, balanced };
  }

  // Non-spoiler dynamic objective text: ONLY cites exact figures AFTER Mara has discovered the corresponding record!
  public getCurrentObjectiveText(): string {
    if (!this.flags.has('acquired_lux_meter')) {
      return 'Enter G1 Triage Atrium and retrieve the Inductive Lux-Meter from the Reception Field Kit.';
    }
    if (!this.puzzles.radiologySafeUnlocked) {
      return 'Search G1 Admissions and G2 Surgical/Radiology wings to cross-reference thoracic radiographs and unlock the Radiology Key Safe.';
    }
    if (!this.puzzles.freightBusEngaged) {
      const psiHint = this.collectedLore.has('lore_09_hydrotherapy_steam_chart') ? ' (60 PSI target)' : '';
      return `Trace concealed yellow conduit in G1 Hydrotherapy, equalize the Three-Valve Steam Manifold${psiHint}, and energize the Auxiliary Shaft Bus.`;
    }
    if (!this.puzzles.dumbwaiterCleared || !this.puzzles.cryoDrawerOpened) {
      if (this.puzzles.crtSubjectQueried) {
        return 'In B1 Cold Archives: recover the Reel Hub from Cryo Drawer C-04 and release G2↔B1 Dumbwaiter Chute Lock 318.';
      }
      return 'Descend the Freight Elevator to B1 Security Rotunda and query the Somnology CRT Directory for Subject 09 storage records.';
    }
    if (!this.puzzles.oscillatorSolved) {
      const waveHint = this.collectedLore.has('lore_14_anechoic_waveform_spec') ? ' (108 Hz / 180° / -12 dB)' : '';
      return `Assemble the Calibration Reel in B2 and align the Control Booth Harmonic Oscillator${waveHint} to unbolt the B3 Blast Hatch.`;
    }
    if (!this.puzzles.substationSolved) {
      const kwHint = this.collectedLore.has('lore_18_substation_load_sheet') ? ' (40/40/40 = 120 kW)' : '';
      return `In B3 Substation: assemble & seat the Restored 30A Cartridge Fuse, then balance the Three-Phase Feeder Matrix${kwHint}.`;
    }
    if (!this.puzzles.cantorContained) {
      return 'In B3 Resonance Containment Gallery: sequence the two Pneumatic Acoustic Lures to draw Subject 09 physically inside the Vault, then throw the Bulkhead Lever!';
    }
    if (!this.flags.has('riser_disconnected')) {
      return 'Ascend the Brick Storm-Drain Culvert to the Hillside Dawn Courtyard and throw the Exterior 13.8 kV Riser Disconnect Switch.';
    }
    if (!this.flags.has('signed_final_certificate')) {
      return 'Sign the Final Utility Disconnect & Acoustic Seal Certificate on the Courtyard bench.';
    }
    return 'Unlatch the Wrought-Iron Street Gate to complete the inspection.';
  }
}
