# VESPER WARD — World & Objective Map

> **Developer spoilers.** This document covers the full topology, exact puzzle solutions, item rewards, and ending. For setup and controls, see the [player guide](README.md).

## 1. Five-Level Vertical Section & Spatial Connectivity

The following is a connection schematic, not a coordinate-scale plan. Repeated room IDs denote the same space. Door links are bidirectional once opened; shortcut latches have the opening sides described below. The complete room names and bounds remain in the ledger.

```text
G2 (+5.0 m)
  R11 Somnology --D09-- R08 Mezzanine --D10-- R12 Physician Study
  R08 Mezzanine --D07-- R09 Operating --D08B-- R10 Radiology --D08-- R08

G1 (0.0 m)
  R01 Portico [SAFE] --D01-- R02 Atrium --D02-- R03 Admissions
  R02 Atrium --D03-- R04 East Ward --D05-- R07 Freight Vestibule
  R04 East Ward --D04-- R05 Hydrotherapy --D06 [Service Key]-- R06 Steam
  R05 Hydrotherapy --SC2 [latch from R05]-- R02 Atrium

B1 (-5.5 m)
  R13 Airlock --D11-- R17 Service Corridor --D12-- R14 Rotunda [SAFE/SAVE]
  R14 Rotunda --D14-- R16 Observation Gallery [SAFE]
  R17 Service Corridor --D13-- R15 Cold Archives / Dumbwaiter Lower Chute

B2 (-11.0 m)
  R21 Dispatch --D15-- R19 Control Booth --D17-- R22 Conduit Stairwell
  R19 Control Booth --D18-- R18 Anechoic Pit --D19-- R20 Cryo --D16-- R21
  R18 Anechoic Pit --SC4 [latch from R18]-- R21 Dispatch

B3 (-16.5 m)
  R24 Substation --D21-- R23 Sump --D22-- R25 Containment --D23-- R26 Culvert
  Within R26: brick incline rises from -16.5 m to the -11.5 m hillside courtyard.

VERTICAL CONNECTORS
  R02 G1 <--> R08 G2 : west atrium stair
  R02 G1 <--> R08 G2 : east fire-stair through SC1, unlatched from upper G2
  R07 G1 <--> R12 G2 : east surgical service stair
  R07 G1 <--> R13 B1 <--> R24 B3 : main freight elevator; B3 call access via SC5
  R17 B1 <--> R21 B2 : main service stair
  R17 B1 <--> R21 B2 : SC3 pneumatic maintenance hatch / ladder
  R22 B2 <--> R23 B3 : deep conduit stair through D20 [oscillator gate]

ITEM TRANSPORT / SIGHTLINES (not extra player doorways)
  R12 G2 <== specimen dumbwaiter item carrier ==> R15 B1
  R08 G2 overlooks R02 G1 through the open atrium.
  R16 B1 looks down into R18 B2 through the observation glazing.
```

There is no direct Somnology-to-Operating doorway (`R11` to `R09`). Use the Mezzanine links. `D06` joins Hydrotherapy to the Steam Manifold (`R05` to `R06`), while the Freight Vestibule is reached through `D05` from the East Ward. The B2 bypass joins the Pit and Dispatch; it does not route through the Conduit Stairwell.

## 2. Complete 26-Room Ledger

| ID | Code | Room Name | Floor | Bounds (`X`, `Y`, `Z` in meters) | Safe Haven | Primary Function |
|---|---|---|---|---|---|---|
| `R01` | `G1-01` | Exterior Storm Portico & Vestibule | `G1` | `[-5..5, 0..3.8, 8..16]` | **Yes** | Spawn, Warrant `#88-412`, sealed pneumatic storm gate |
| `R02` | `G1-02` | G1 Triage Atrium & Reception | `G1` | `[-9..9, 0..9.2, -8..8]` | No | Double-height hub, **Lux-Meter Field Kit**, West/East stairs |
| `R03` | `G1-03` | G1 Admissions & Patient Records Office | `G1` | `[-19..-9, 0..3.8, -6..6]` | No | Admissions Transfer Ledger (`Bed 11`), `Radiograph Bed 04`, Cell |
| `R04` | `G1-04` | G1 East Ward Corridor & Linen Alcove | `G1` | `[9..23, 0..3.8, -8..0]` | No | Scripted Cantor glimpse, broken glass hazard, crouch gurney, buzzer |
| `R05` | `G1-05` | G1 Hydrotherapy Tub Hall | `G1` | `[9..21, 0..3.8, 0..10]` | No | Concealed 13.8 kV conduit trace, 3-valve chart, **Shortcut 2** (`D_SC2`) |
| `R06` | `G1-06` | G1 Steam Manifold & Boiler Alcove | `G1` | `[21..30, 0..3.8, 2.2..9]` | No | **Puzzle 2**: 3-valve steam equalization (`60 PSI`) & Auxiliary Shaft Bus |
| `R07` | `G1-07` | G1 Freight Vestibule & Dumbwaiter Bay | `G1` | `[23..28.5, 0..3.8, -8..2.2]` | No | Service stair to `R12`, Dumbwaiter notice, Freight Elevator G1 landing |
| `R08` | `G2-01` | G2 Mezzanine Balcony & Nurse Station | `G2` | `[-9..9, 5..9.2, -8..8]` | No | Open wrought-iron overlook, **Manual Save Recorder**, Gauze, **Shortcut 1** (`D_SC1`) |
| `R09` | `G2-02` | G2 Operating Amphitheatre | `G2` | `[-9..0, 5..9.0, -18..-8]` | No | Pedestal table (`Hide`), scialytic lamp, `Radiograph Bed 11 (J. Vane)` |
| `R10` | `G2-03` | G2 Radiology & Ruby Darkroom | `G2` | `[0..9, 5..9.0, -18..-8]` | No | **Puzzle 1**: Lightbox & Safe (`1947`) → `Service Key` + `Lamp Calibration` |
| `R11` | `G2-04` | G2 Somnology Ward & Curtain Cubicles | `G2` | `[-19..-9, 5..9.0, -16..-4]` | No | `Pocket Watch` (`47` engraved on caseback), `Radiograph Bed 17`, Curtain Hide |
| `R12` | `G2-05` | G2 Head Physician's Wood-Paneled Study | `G2` | `[9..26.8, 5..9.0, -16..-4]` | No | Voice Reel `#01`, `30A Fuse Holder`, `G2↔B1 Dumbwaiter` upper hatch |
| `R13` | `B1-01` | B1 Freight Airlock & Decontamination Scrub | `B1` | `[18..28.5, -5.5..-1.7, -8..0]` | No | Freight Elevator B1 landing & decontamination bulkhead (`D11`) |
| `R14` | `B1-02` | B1 Security Rotunda | `B1` | `[-6..6, -5.5..-1.7, -10..2]` | **Yes** | **Safe Haven**, **Manual Save Recorder**, **Puzzle 3A** Subject CRT (`C-04` / `318`) |
| `R15` | `B1-03` | B1 Cold Archives & Cryogenic Morgue | `B1` | `[6..22, -5.5..-1.7, -28..-16]` | No | **Puzzle 3B**: Cryo Drawer `C-04` (`Reel Hub`) & `G2↔B1 Chute` (`318` → `30A Fuse Element`) |
| `R16` | `B1-04` | B1 Upper Anechoic Observation Gallery | `B1` | `[-6..6, -5.5..-1.7, -20..-10]` | **Yes** | **Safe Haven**, glass overlook into `R18` Pit, Voice Reel `#02` |
| `R17` | `B1-05` | B1 Sub-Basal Service Corridor & Stairhead | `B1` | `[6..18, -5.5..-1.7, -16..0]` | No | Active patrol loop, utility locker hide, buzzer, `B1→B2` stair, **Shortcut 3** top |
| `R18` | `B2-01` | B2 Anechoic Suspension Pit | `B2` | `[-6..6, -11.0..-1.7, -36..-20]` | No | Double-height wedge chamber, 3 concentric brass rings, **Shortcut 4** (`D_SC4`) |
| `R19` | `B2-02` | B2 Acoustic Control & Oscillator Booth | `B2` | `[-6..6, -11.0..-7.2, -20..-14]` | No | **Puzzle 4**: Reel Transport & 3-Dial Phase Oscillator (`108 Hz`, `180°`, `-12 dB`) |
| `R20` | `B2-03` | B2 Cryo-Pathology Specimen Loop | `B2` | `[6..20, -11.0..-7.2, -36..-24]` | No | `Master Tape Spool`, infinite-floor `Glass Vial Dispenser`, Cryo gurney hide |
| `R21` | `B2-04` | B2 Pneumatic Dispatch & Bypass Airlock | `B2` | `[6..18, -11.0..-7.2, -24..-14]` | No | Figure-eight hub, **Shortcut 3** (`B2↔B1` ladder hatch), Capacitor Cell |
| `R22` | `B2-05` | B2 Deep Acoustic Conduit Stairwell | `B2` | `[-16..-6, -11.0..-7.2, -26..-14]` | No | Gear locker hide, Blast Hatch `D20` descending to `R23` |
| `R23` | `B3-01` | B3 Flooded Turbine Sump | `B3` | `[-16..6, -16.5..-12.0, -26.5..-16]` | No | Ankle-deep water (splash noise + animated ripples), turbine horn lure |
| `R24` | `B3-02` | B3 High-Voltage Substation Hall | `B3` | `[6..28.5, -16.5..-12.0, -22..-2]` | No | **Puzzle 5A**: 13.8 kV 3-phase matrix (`40/40/40 kW`), **Shortcut 5** (`Lift Override`) |
| `R25` | `B3-03` | B3 Resonance Containment Gallery | `B3` | `[-8..6, -16.5..-12.0, -38..-26.5]` | No | **Puzzle 5B**: Dual acoustic lures + physical vault occupancy bulkhead seal |
| `R26` | `EXT-04` | Brick Storm-Drain Culvert & Dawn Courtyard | `B3` | `[-38..-8, -16.5..-2.0, -40..-26]` | **Yes** | Brick ramp (`-16.5→-11.5 m`), 13.8 kV Riser Switch, Certificate `#88-412`, Exit Gate |

## 3. Five Unlockable Mechanical Shortcuts

1. **Shortcut 1 (`D_SC1`)**: G2 Mezzanine Balcony East Fire-Gate → G1 Triage Atrium East Staircase (one-way latch from `G2`).
2. **Shortcut 2 (`D_SC2`)**: G1 Hydrotherapy Double Doors → G1 Triage Atrium (unchained from `R05` side).
3. **Shortcut 3 (`int_shortcut3_hatch` / `int_shortcut3_top`)**: B2 Dispatch Airlock ↔ B1 Service Corridor pneumatic maintenance ladder hatch (unbolted from `B2`) with carved ceiling/floor shaft (`x: 7.85..8.95, z: -15.05..-14.05`), `21`-rung vertical ladder, hinged hatch lid, `B1` safety curb rails, and continuous climb transition (implemented in `round5`; source-bound geometry and actual public-control roundtrip verified on R8).
4. **Shortcut 4 (`D_SC4`)**: B2 Anechoic Pit Walkway → B2 Dispatch Airlock bypass bulkhead (unbolted from `R18` walkway side).
5. **Shortcut 5 (`int_shortcut5_override`)**: B3 Substation Landing Call Override → links Main Freight Elevator directly across `B3 ↔ B1 ↔ G1`.

## 4. Progression Dependencies and Clue Trail

Spatial traversal contains loops. Persistent quest progression is monotonic, with the following source-enforced gates for ordinary UI interaction. Clues explain how a first-time player learns answers; reading a clue is not automatically an enforced inventory/state prerequisite. This distinction prevents the walkthrough from overstating the implemented gate graph.

```text
G2 Radiology: correct safe input
  -> Service Key + lamp calibration
  -> Service Key opens D06
  -> Three-valve equilibrium permits Auxiliary Shaft Bus activation
  -> Powered freight elevator reaches B1; powered dumbwaiter brake can release

B1 Cold Archives: correct drawer selection -> Reel Hub
B1 powered dumbwaiter + correct brake code -> Silver Fuse Element
B2 Cryo-Pathology (reachable from B1 before reel assembly) -> Master Tape Spool
Reel Hub + Master Tape Spool -> Calibration Reel
Mounted reel + correct oscillator alignment -> D20 unlocked -> B3 access

G2 Physician Study (accessible before the Radiology safe) -> Fuse Holder
3D examiner unthreading flag + Fuse Holder + Silver Fuse Element -> Restored Fuse
Restored Fuse seated + balanced phase switches -> Substation transfer / Act III
Substation transfer -> Approach Lure -> nearby entity -> Vault Cell Lure
Both lure flags + entity physically inside vault -> Containment Lever
  -> culvert gate D23 unlocked -> hillside courtyard

Courtyard disconnect flag + signed certificate flag + containment complete
  -> street gate -> credits
```

The intended first-time clue trail is the Admissions Ledger, three radiographs and watch caseback for Radiology; Hydrotherapy instructions/conduit tracing for the steam bus; cross-referencing Subject 09's original intake date from the G1 Admissions Ledger on the B1 Rotunda CRT chronological index for the archive drawer and brake code; Lab Note #14 plus the assembled reel for the oscillator; and the load sheet plus emergency transcript for the substation/containment sequence. The two recipes and exact answers are listed in Section 5.

Implementation details relevant to verification:

- The safe accepts the correct code without checking mounted-plate, ledger-read or watch-inspection flags. Those are discovery activities in the normal clue trail.
- The conduit junction records a trace flag, but the bus handler checks pressure rather than that flag. Its use must therefore be observed separately in a full-content verification run.
- The B1 Rotunda CRT (`#inp-crt-intake-date`, `#btn-query-crt`, `#btn-log-crt`) queries original Somnology intake dates (`YYYY-MM-DD`): `1984-10-06` returns Subject 04 (`A-02`, discharged), `1984-12-03` returns Subject 12 (`B-06`, transferred), and `1984-11-17` returns Subject 09 / Julian Vane (`C-04` / `318`). Malformed and unknown dates fail reversibly without item loss or Safe Haven penalties, and entering `1984-11-17`, pulling `C-04`, or entering `318` remains knowledge-based without arbitrary `collectedLore` or reading-flag gates.
- The Fuse Holder can be collected on the first G2 visit; the Service Key is not a prerequisite for entering the Study.
- The final disconnect and certificate flags may be obtained in either order. Both are required by the exit gate.

These source-derived dependencies establish neither a completed traversal test nor blind human pacing. The independent acceptance report owns those conclusions.

### Anti-Softlock Safeguards
- **Essential items** (`lux_meter`, `service_key`, `xray_plate_*`, `pocket_watch`, `fuse_holder`, `fuse_wire`, `restored_fuse`, `reel_hub`, `tape_spool`, `calibration_reel`) cannot be dropped, discarded, or wasted.
- **Infinite Lamp Floor**: Holding `R` recharges the Lux-Meter anywhere without Capacitor Cells.
- **Distraction Supply Floor**: Interacting with the `R20` Emergency Vial Dispenser restores the held vial count to `2` when below `2`. Separately, the world supply safeguard respawns two authored vial pickups when the total held plus remaining world vial count reaches zero.
- **Health Stabilization Floor**: Manual save stations (`R08`, `R14`) stabilize `health: 1 → 2` if `gauze_injector === 0`, and Safe Havens (`R01`, `R14`, `R16`, `R26`) passively stabilize wounds after `16s`.
- **Substation Overload Recovery**: Exceeding `50 kW` on any phase safely trips `S1..S4` back to open so the puzzle can never lock.

## 5. Known-Solution Developer Reference

These are source-derived puzzle answers, separated from the player guide. They are not evidence of a verified end-to-end playthrough.

1. **Radiology:** read the Admissions Ledger, collect all three plates (Beds 04, 11 and 17), inspect the pocket watch caseback, and mount the plates on the lightbox. Combine the Bed 11 clamp prefix `19` with the watch suffix `47`: safe code **1947**. Rewards are the Service Key and Lux-Meter harmonic calibration.
2. **Steam and shaft power:** inspect the concealed Hydrotherapy conduit and enter the Boiler/Manifold area with the Service Key. The solution has **V1, V2 and V3 open**: baseline `15 + 40 + 25 − 20 = 60 PSI`. The initial state already has V2 open; do not interpret the solution as “toggle every valve once.” Engage the Auxiliary Shaft Bus after equalization.
3. **Archive and dumbwaiter:** read Subject 09's original Somnology intake date (**1984-11-17**) in the G1 Admissions & Sub-Basal Transfer Ledger, enter **1984-11-17** into the B1 Security Rotunda CRT chronological index (`#inp-crt-intake-date` → `#btn-query-crt`), and optionally log the record (`#btn-log-crt`); the assigned drawer is **C-04** and the brake/chute override is **318**. Retrieve the Reel Hub and the Silver Fuse Element from their corresponding archive/chute operations.
4. **Oscillator:** collect the Master Tape Spool in B2, combine it with the Reel Hub, and mount the assembled reel. Set **108 Hz / 180° / −12 dB**. Successful alignment unlocks the B3 blast hatch and alerts the threat.
5. **Substation and containment:** inspect/unthread the Fuse Holder in the 3D examiner, combine it with the Silver Fuse Element, and seat the restored cartridge. Close **S1, S2 and S3**, leaving **S4 open**, for `40 / 40 / 40 kW`. Sequence the Approach Lure and Vault Cell Lure, confirm the entity is physically inside the vault, and operate the containment lever. Proceed through the culvert, operate the exterior disconnect, sign the final certificate and use the street gate.
