import { CombinationRecipe, ItemDef, LoreEntryDef } from '../core/types';

export const ITEMS: Record<string, ItemDef> = {
  lux_meter: {
    id: 'lux_meter',
    name: 'Inductive Field Lamp & Harmonic Dosimeter ("Lux-Meter")',
    category: 'tool',
    essential: true,
    description:
      'Municipal-clinical field lamp fitted with a focused Tungsten lens [L], darkroom Ruby filter [L], hand-wound induction dynamo [Hold R], and a phosphor needle sensitive to concealed 60 Hz wiring and tympanic harmonic fields.',
    examinerModel: 'lux_meter',
  },
  pocket_watch: {
    id: 'pocket_watch',
    name: "Head Nurse's Tarnished Brass Pocket Watch",
    category: 'puzzle',
    essential: true,
    description:
      'Stopped at 03:14. Heavy brass Hunter case belonging to Head Nurse Beatrice Haldane. Something appears finely engraved across the rear casing.',
    examinerModel: 'pocket_watch',
    examineSecretFlag: 'inspected_watch_back',
    examineSecretText: 'Rear casing engraving read: "RADIOLOGY NARCOTICS & KEY SAFE — SUFFIX: 47 (PAIR WITH CLAMP STAMP)."',
  },
  xray_plate_a: {
    id: 'xray_plate_a',
    name: 'Thoracic Radiograph — Ward Bed 04 (M. Kestrel)',
    category: 'puzzle',
    essential: true,
    description: 'Silver-gelatin chest plate from Somnology Ward Bed 04. Clean rib silhouette; no retained surgical hardware.',
    examinerModel: 'xray_plate',
  },
  xray_plate_b: {
    id: 'xray_plate_b',
    name: 'Thoracic Radiograph — Ward Bed 11 (J. Vane)',
    category: 'puzzle',
    essential: true,
    description:
      'Silver-gelatin chest plate marked Bed 11. A dense metallic hemostat shadow is visible over the right bronchus; requires Lightbox illumination to read the stamped ward digits.',
    examinerModel: 'xray_plate',
  },
  xray_plate_c: {
    id: 'xray_plate_c',
    name: 'Thoracic Radiograph — Ward Bed 17 (E. Mercer)',
    category: 'puzzle',
    essential: true,
    description: 'Silver-gelatin chest plate from Bed 17 showing pleural scarring, without implanted resonator clamps.',
    examinerModel: 'xray_plate',
  },
  service_key: {
    id: 'service_key',
    name: 'Sub-Station & Hydrotherapy Service Key',
    category: 'key',
    essential: true,
    description: 'Notched brass municipal service key stamped "G1 HYDRO CONDUIT / BOILER SWITCHGEAR".',
    examinerModel: 'service_key',
  },
  fuse_holder: {
    id: 'fuse_holder',
    name: 'Corroded Brass 30A Cartridge Fuse Holder',
    category: 'puzzle',
    essential: true,
    description:
      "Heavy porcelain-and-brass substation fuse body recovered from Dr. Vane's study. Rotate in 3D Examiner to unthread the end-cap before fitting replacement silver wire.",
    examinerModel: 'fuse_holder',
    examineSecretFlag: 'fuse_holder_unthreaded',
    examineSecretText: 'End-cap unthreaded and oxidized filament cleared — ready to combine with Calibrated 30A Silver Fuse Element.',
  },
  fuse_wire: {
    id: 'fuse_wire',
    name: 'Calibrated 30A Silver Fuse Element',
    category: 'puzzle',
    essential: true,
    description: 'Precision silver-alloy fusible strip dispatched down the G2↔B1 Specimen Dumbwaiter shaft.',
    examinerModel: 'fuse_wire',
  },
  restored_fuse: {
    id: 'restored_fuse',
    name: 'Restored 30A High-Voltage Cartridge Fuse',
    category: 'key',
    essential: true,
    description: 'Rebuilt 30A cartridge assembly rated for the B3 Sub-Basal Substation 3-phase feeder panel.',
    examinerModel: 'restored_fuse',
  },
  reel_hub: {
    id: 'reel_hub',
    name: 'Unwound Harmonic Calibration Reel Hub',
    category: 'puzzle',
    essential: true,
    description: 'Machined aluminum 7-inch instrumentation hub stamped "ANECHOIC DECK 09-B" from Cryo Drawer C-04. Missing its magnetic master tape.',
    examinerModel: 'reel_hub',
  },
  tape_spool: {
    id: 'tape_spool',
    name: 'Subject 09 Acoustic Master Tape Spool',
    category: 'puzzle',
    essential: true,
    description: 'Sealed quarter-inch oxide tape wound on a transport core in B2 Cryo-Pathology. Combine with the Calibration Reel Hub to mount.',
    examinerModel: 'tape_spool',
  },
  calibration_reel: {
    id: 'calibration_reel',
    name: 'Assembled Harmonic Calibration Reel (09-B)',
    category: 'key',
    essential: true,
    description: 'Complete 7-inch reference reel ready for the B2 Acoustic Control Booth oscillator deck.',
    examinerModel: 'calibration_reel',
  },
  capacitor_cell: {
    id: 'capacitor_cell',
    name: 'Silver-Zinc Capacitor Cell',
    category: 'consumable',
    essential: false,
    stackable: true,
    description: 'Silent emergency charge cartridge for the Lux-Meter [Press G]. Restores full capacitor charge without dynamo noise.',
    examinerModel: 'cell',
  },
  gauze_injector: {
    id: 'gauze_injector',
    name: 'Antiseptic Gauze & Procaine Syrette',
    category: 'consumable',
    essential: false,
    stackable: true,
    description: 'Field trauma dressing [Press H]. Stabilizes thoracic lacerations and clears wounded limping.',
    examinerModel: 'injector',
  },
  glass_vial: {
    id: 'glass_vial',
    name: 'Empty Glass Specimen Vial',
    category: 'consumable',
    essential: false,
    stackable: true,
    description: 'Thick borosilicate pathology bottle [Press V to throw]. Shatters loudly on impact to lure The Cantor away from an objective.',
    examinerModel: 'vial',
  },
};

export const COMBINATION_RECIPES: CombinationRecipe[] = [
  {
    itemA: 'fuse_holder',
    itemB: 'fuse_wire',
    requiresFlag: 'fuse_holder_unthreaded',
    requiresHint: 'Inspect the Corroded Brass Fuse Holder in 3D Examination first to unthread its oxidized end-cap.',
    resultItem: 'restored_fuse',
    setsFlag: 'crafted_restored_fuse',
    message: 'Combined Fuse Holder + 30A Silver Element into Restored 30A Substation Fuse.',
  },
  {
    itemA: 'reel_hub',
    itemB: 'tape_spool',
    resultItem: 'calibration_reel',
    setsFlag: 'crafted_calibration_reel',
    message: 'Spun Subject 09 Master Tape onto Aluminum Hub — Assembled Harmonic Calibration Reel (09-B).',
  },
];

export const LORE_ENTRIES: LoreEntryDef[] = [
  {
    id: 'lore_01_demolition_order',
    number: 1,
    title: 'Municipal Reclamation Warrant #88-412',
    author: 'Mara Solis, Structural Reclamation Inspector',
    date: 'November 17, 1994 — 21:40',
    medium: 'Document',
    roomId: 'R01',
    body: `CITY OF HAVENPORT — BUREAU OF CONDEMNED STRUCTURES
Site: St. Damian Thoracic & Somnology Infirmary (Constructed 1928; Clinical Annex 1976).
Inspector of Record: Mara Solis.
Field Action: Wrecking crews take possession at 06:00 tomorrow only after municipal water, steam, and 13.8 kV transformer disconnects are certified cold. At the Storm Portico, the exterior induction spindle is still turning at 120 kilowatts, and three yellow armoured feeder conduits plunge past G1 triage into unlisted bedrock. Trace the active bus, trip the primary disconnect, and sign the condemnation release before runoff floods the hillside drains.

Under the portico lantern I checked the Chancery receivership plat from March 1985: on paper St. Damian is a two-story brick charity hospital over a shallow coal cellar—no sub-basements, no high-voltage vault, no lower egress save a brick storm culvert down the bluff. Yet stapled behind Warrant #88-412 sits Harbor Drainage & Storm-Pumping Covenant 76-C, countersigned in October 1976 by Surgeon-in-Chief Dr. Henrik Vane and Public Works Deputy Arthur Penn. That rider billed continuous three-phase current to coastal flood control rather than Hospital Health Services, shielding a shuttered infirmary from audit for nine winters.

Someone wanted this building razed from the roof inward without an inspector ever walking below slab grade. Yesterday Penn's retired clerk telephoned twice, insisting the portico switch was pulled in 1985 and urging me to sign from my car. Yet the lead utility tag crimped onto the portico conduit saddle is stamped DPW-76 rather than Municipal Power, the outer padlock was oiled within the month, the meter glass sits warm against my knuckles, and a steady sixty-cycle tremor hums underfoot.`,
  },
  {
    id: 'lore_02_triage_kit_memo',
    number: 2,
    title: 'Field Maintenance Circular: Inductive Lux-Meter',
    author: 'Facility Plant Engineering',
    date: 'October 04, 1984',
    medium: 'Document',
    roomId: 'R02',
    body: `TO NIGHT ORDERLIES & PLANT TECHNICIANS — TRIAGE FIELD KIT OPERATING GUIDE:
Use only the issued Inductive Field Lamp & Harmonic Dosimeter ("Lux-Meter"):
1. TUNGSTEN BEAM [L] casts a long white beam that reveals ward hazards and stenciled yellow conduit markings, but bright glare across plaster or wet tile exposes your position across open rooms.
2. RUBY SAFELIGHT [L] filters output to 640 nm crimson—cutting battery drain and reducing visual detection distance, though neither Ruby nor Lamp Off renders staff invisible at close range.
3. HAND DYNAMO [Hold R] recharges the capacitor indefinitely when Silver-Zinc Cells [G] run dry, but its brass ratchet clicks carry nearly twenty meters through quiet halls.
4. PHOSPHOR DOSIMETER NEEDLE deflects near concealed 60 Hz feeders behind walls and trembles near Sub-Basal acoustic fields.

This circular supersedes prior lantern requisitions ahead of Dr. Vane's autumn Somnology intake. Last Tuesday Dr. Vane ordered Chief Sato to confiscate every commercial dry-cell flashlight at the portico desk, claiming unshielded battery cases introduced sixty-hertz hum into Dr. Orlov's lower-vault telemetry. Plant Engineering bench-tested four confiscated torches and measured zero electromagnetic leakage; Vane's real concern is photic agitation among dark-adapted sensory subjects scheduled for G2 ward observation, where uncollimated white beams trigger violent startle reflexes while narrowband 640 nm crimson stays far less conspicuous at corridor distance.

Technicians tracing feeders below G1 should note that Head Nurse Haldane impounded our spare secondary Harmonic Calibration Coil on Monday after an apprentice followed unlisted yellow cables behind the hydrotherapy tilework. She locked that coil inside the G2 Radiology Narcotics & Key Safe alongside the Sub-Station Service Key. Carry spare Silver-Zinc Cells for silent ward top-ups, and wind your dynamo only behind closed doors.`,
  },
  {
    id: 'lore_03_admissions_ledger',
    number: 3,
    title: 'G1 Admissions & Sub-Basal Transfer Ledger',
    author: 'Beatrice Haldane, Head Nurse',
    date: 'February 19, 1985',
    medium: 'Clinical Ledger',
    roomId: 'R03',
    body: `ST. DAMIAN SOMNOLOGY ADMISSIONS — RESTRICTED TRANSFER REGISTER
• Ward Bed 04 — M. Kestrel (Original Intake: 06 October 1984 / 1984-10-06): Chronic night terrors; discharged to coastal convalescent home. Radiograph clean.
• Ward Bed 11 — Julian Vane, Cathedral Choir Baritone (Original Intake: 17 November 1984 / 1984-11-17): Admitted for vocal fold paresis; reassigned by Dr. Henrik Vane to Sub-Basal Tympanic Program as SUBJECT 09. NOTE: Pre-transfer G2 radiograph flagged a retained hemostat surgical clamp stamped with the TWO-DIGIT PREFIX of the G2 Radiology Narcotics & Key Safe.
• Ward Bed 17 — E. Mercer (Original Intake: 03 December 1984 / 1984-12-03): Coal-dust pleurisy; transferred to county ward.

B1 CHRONOLOGICAL INDEX: The Rotunda CRT terminal searches original intake dates only. Ward bed numbers and this register's compilation date are not search keys. Enter dates as YYYY-MM-DD.
SAFE CODE PROTOCOL: Never write the full four-digit safe code in one place. Read the two-digit prefix off Bed 11's X-ray plate on the G2 Radiology Lightbox, and pair it with the two-digit suffix engraved on the back of my brass pocket watch.

MARGINAL ATTESTATION — B. HALDANE, R.N.: I am binding this fair copy in ink before Chief Sato strips the G1 filing cabinets. Compare Bed 11's admission card with the Sub-Basal transfer rider and the discrepancy stares off the page: Julian Vane signed his own intake consent on 17 November in a steady baritone's hand, authorizing only conservative recurrent-nerve decompression so he might sing Advent vespers again at St. Jude's Cathedral. The Sub-Basal reassignment slip bearing Henrik Vane's countersignature is dated 29 November at 23:40—more than three hours after Julian was already under ether in the G2 Amphitheatre. Kestrel's clean plate and Mercer's scarred pleurisy film showed neither implanted hardware nor the resonant chest volume Henrik sought, so both patients were sent safely away; Julian was kept because he shared his brother's surname and possessed a trained singer's ribcage.`,
  },
  {
    id: 'lore_04_storm_quarantine_note',
    number: 4,
    title: 'Pneumatic Fire-Gate Override Notice',
    author: 'Security Chief R. Sato',
    date: 'March 11, 1985',
    medium: 'Document',
    roomId: 'R02',
    body: `FACILITY LOCKDOWN & EGRESS NOTICE:
By order of Dr. Henrik Vane, the G1 Portico pneumatic fire-shutter is slaved directly to the B3 Sub-Basal containment bus. Whenever harmonic activity or load imbalance occurs in the lower vaults, backup current drops the street shutter automatically. Because St. Damian sits terraced into the coastal limestone bluff, the sole remaining physical exit once the portico seals is the vaulted Brick Storm-Drain Culvert ascending from B3 to the lower hillside Rear Courtyard.

I signed the wiring work-order in January because Dr. Vane showed me a forged Harbor Authority acoustic-ordinance waiver and warned that street-level resonance from Level B2 could crack tenement windows along Steep Lane if the front vestibule stood open. For twelve years on the dockside police I followed harbor engineers without questioning their math, and for six months here I cashed Vane's private foundation stipend while telling orderlies the steel shutter was merely a storm-surge damper.

Tonight Boilerman Callahan dragged me into the vestibule and showed me the truth on the relay lug: the shutter solenoid is wired fail-closed from below. Anyone entering through the G1 Portico after the lower bus trips cannot pry that gate back up from street level, nor can G1 switchgear release it. Only a full three-phase load transfer in the B3 Substation powers the lower culvert floodgate interlock, and even that floodgate refuses to unbolt unless the B3 containment cell registers mechanically sealed. Vane did not build a storm barrier; he built a one-way valve to keep witnesses inside until his work was finished.`,
  },
  {
    id: 'lore_05_surgical_amphitheatre_log',
    number: 5,
    title: 'Operative Report: Thoracic Resonator Graft',
    author: 'Dr. Henrik Vane, Chief Thoracic Surgeon',
    date: 'November 29, 1984',
    medium: 'Document',
    roomId: 'R09',
    body: `OPERATING AMPHITHEATRE — CASE 09 (J. VANE) — CLINICAL SUMMARY:
Under scialytic illumination four tuned phosphor-bronze sympathetic ribs were anchored around the sternum, coupled to a vagus-tympanic bridge and stabilized with a right-leg orthopedic brace. Post-operative optic hemorrhage narrowed Subject 09's sight to dim forward silhouettes while amplifying auditory acuity across concrete rooms—footsteps, broken glass, and brass dynamo clicks register instantly. During closure, instrument count missed one stamped Hemostat Clamp over the right bronchus; mount Bed 11's thoracic plate alongside the companion ward films on the G2 Radiology Lightbox to read its two-digit stamp.

ADDENDUM FOR PRIVATE SURGICAL FILE: Head Nurse Haldane refused to countersign the operative record tonight, accusing me of exceeding Julian's consent form. Nurse Haldane thinks like a parish almoner. When I opened my brother's anterior mediastinum at 20:15, the squamous lesion had already infiltrated both recurrent laryngeal branches and wrapped the tracheal ring. Had I performed the timid decompression Julian requested on 17 November, he would have woken permanently mute and suffocated before Easter.

Breath is a crude bellows; bone and bronze do not ulcerate. By coupling Clara Orlov's phosphor-bronze sympathetic ribs directly to the eighth cranial nerve relay, I preserved the exact resonant geometry of Julian's chest cavity independent of failing vocal folds. Right-side peroneal nerve traction during dorsal tuning-rod seating required bolting a hinged steel orthopedic caliper from thigh to boot heel so he can bear weight without buckling. The retrobulbar hemorrhage at 22:05 was a regrettable hypertensive spike, and the retained clamp occurred only because surgical ward orderly Hollis—pressed into scrub-attendant duty that evening—panicked when Julian's sternum answered the overhead transformer hum at 108 cycles per second. I forbade re-incision lest we disturb the costal tuning pins; once Clara trims B2, Julian will sustain intervals no mortal throat ever held.`,
  },
  {
    id: 'lore_06_radiology_darkroom_protocol',
    number: 6,
    title: 'G2 Radiology Lightbox & Calibration Memo',
    author: 'Technician L. Novak',
    date: 'January 15, 1985',
    medium: 'Document',
    roomId: 'R10',
    body: `RADIOLOGY & SAFE ACCESS PROTOCOL:
1. Hang all three Somnology thoracic radiographs together on the G2 Lightbox (Ward Beds 04, 11, and 17) to engage the full-bank illumination bar and inspect Bed 11's retained clamp shadow.
2. Nurse Haldane locked the Sub-Station Service Key and the secondary Lux-Meter Harmonic Calibration Coil inside the Radiology wall safe beside the developing trays.
3. The safe uses a split four-digit combination: pair the two-digit prefix stamped on Bed 11's hemostat with the two-digit suffix engraved on the back of Haldane's brass pocket watch, which she carries on G2 Somnology Ward rounds.

I am taping this memo inside the darkroom dry-rack in case Dr. Vane has me dismissed before Friday. On 30 November he stormed in while Bed 11's silver-gelatin plate was still dripping fixer and ordered me to surrender the negative and smash the glass cassette. When I held the wet acetate against the ruby safelight, I understood his haste: clenched beside the bronze sternal struts sat our spare Radiology arterial clamp—the one Nurse Haldane had die-stamped last autumn with the opening half of the narcotics safe code so surgical residents could never borrow a Radiology tray tool without accountability.

I handed Dr. Vane an overexposed scout exposure fogged under tungsten light and hid the true Bed 11 radiograph inside the surgical teaching jacket, while dispersing Kestrel's clean Bed 04 plate to G1 Admissions and Mercer's scarred Bed 17 film to G2 Somnology so no single raid could sweep the mandatory three-panel comparison set. Haldane backed me without hesitation. That same evening she carried her father's tarnished brass Hunter watch to the instrument engraver on Harbor Street and scored the safe's closing digits across its rear caseback so Vane could never unlock G1 Hydrotherapy or impound the calibration coil alone.`,
  },
  {
    id: 'lore_07_somnology_ward_chart',
    number: 7,
    title: 'Somnology Observation Chart: Auditory Hyperacusis',
    author: 'Beatrice Haldane, Head Nurse',
    date: 'February 27, 1985',
    medium: 'Document',
    roomId: 'R11',
    body: `BEHAVIORAL & EVASION OBSERVATIONS — WARD NIGHT SHIFT:
• Tungsten lamp glare provokes immediate pursuit; Subject 09 bashes through closed unlocked ward doors in roughly 2.5 seconds.
• Switching to 640 nm Ruby Safelight or Lamp Off narrows his visual range, but does NOT make staff invisible at close quarters.
• Slipping behind drawn cubicle curtains, under draped tables, or into ventilated lockers evades him ONLY after breaking his line of sight around a corner or partition; hiding while he watches fails immediately.

02:10 — Julian stood outside the frosted Somnology partition for forty minutes, tilting those dreadful bronze costal ribs toward the rain drumming against the clerestory glass. Orderly Kwon whispered in the pantry yesterday that darkroom ruby light acts like a cloak. I reprimanded him sharply: Julian's damaged eyes still catch silhouette movement two paces away even in total darkness, and his grafted tympanic horns track boot leather, shallow panicked breathing, and every click of a hand dynamo.

02:55 — When Julian drifted toward Bed 11—his own empty iron cot from November—I extinguished my white beam, rounded the linen screen first, and drew the heavy cubicle curtain still. He passed within an arm's breadth, right leg brace scraping the linoleum in three-quarter time. Before closing his hand around the curtain rod, he tapped four measured beats against the brass bedpost: the opening cadence of the Cathedral *Nunc Dimittis* he sang the Sunday before admission. He remembers who he was, and Henrik's ringing chest-cage will not let him sleep.

03:14 — A bottle smashed down on G1 East Corridor; Julian bolted toward the stairs. My watch chain snagged on Cubicle 11's frame and snapped as I slammed the balcony door—I must recover the watch at shift change before Henrik finds it.`,
  },
  {
    id: 'lore_08_vane_study_reel',
    number: 8,
    title: 'Reel Transcript #01: "A Voice Without Lungs"',
    author: 'Dr. Henrik Vane',
    date: 'December 18, 1984',
    medium: 'Audio Transcript',
    roomId: 'R12',
    body: `[MAGNETIC REEL CLICK — WARM TUBE HUM]
CUSTODY DOCKET — STUDY DICTATION SPOOL #01: Dr. Vane removed the Corroded Brass 30A Cartridge Fuse Holder from the B3 Substation spare kit onto this G2 study desk (turn and inspect the casing closely by hand to unthread its oxidized end-cap) and queued its Calibrated 30A Silver Fuse Element inside the G2↔B1 Specimen Dumbwaiter.

"The municipal health board still imagines St. Damian treats coal-miners' pleurisy and dockside insomnia. Let them keep their charitable plaques. Beneath our 1928 brick foundation lies dry Carboniferous limestone acoustically decoupled from Havenport harbor. When Clara Orlov hung her three concentric brass suspension rings in the B2 pit two winters ago, her standing sub-audible waves quieted thalamic tremor within ninety seconds—halting REM fragmentation altogether.

Clara lacked the courage of her own equations. She wanted to publish polite papers on sleep architecture while my brother coughed blood into a choir-stall handkerchief. Julian came up the hill on 17 November begging me for six more months of voice—just enough breath to finish the winter psalter. As if six months of rasping decay were mercy! In the amphitheatre I gave him an instrument that never tires: phosphor-bronze ribs resonant with the B2 array itself, a voice without lungs.

Now Clara and Chief Sato whisper about transferring the B3 substation bus to the hillside storm culvert and shutting down the pit rings because Julian paces at night when uncalibrated street harmonics bleed down the elevator shaft. I will not allow timid subordinates to extinguish a miracle mid-tuning. Julian's hand-copied cathedral vespers score stays locked inside my desk beside his sole baseline voice tape on Reel 09-B; tonight I also unscrewed the 30-amp cartridge fuse holder from the B3 spare rack onto my blotter and sealed its silver fusible strip inside the G2-to-B1 specimen dumbwaiter carrier. Nobody throws the B3 culvert transfer without my hand."`,
  },
  {
    id: 'lore_09_hydrotherapy_steam_chart',
    number: 9,
    title: 'Boiler & Hydrotherapy Three-Valve Operating Plate',
    author: 'Chief Boilerman T. Callahan',
    date: 'January 08, 1985',
    medium: 'Document',
    roomId: 'R05',
    body: `HYDROTHERAPY THREE-VALVE STEAM ISOLATION & BUS RESTORATION:
Whenever manifold pressure drifts off equilibrium, a ruptured supply elbow floods the east switchgear alcove with scalding steam until pressure is balanced at EXACTLY 60 PSI:
• Residual Line Baseline: 15 PSI
• Valve V1 (Main Header): +40 PSI
• Valve V2 (Tub Bypass): +25 PSI
• Valve V3 (Condenser Bleed): -20 PSI
Reaching 60 PSI seals the steam jet and engages the Auxiliary Shaft Bus—powering both the Main Freight Elevator (G1↔B1↔B3) and the G2↔B1 Specimen Dumbwaiter. Keep crouched across flooded tile to quiet boot splashes (broken glass in adjacent halls still crunches loudly), and unchain the west Hydrotherapy doors (Shortcut 2) back to the Atrium.

CHIEF BOILERMAN'S LOG — T. CALLAHAN: Nurse Haldane keeps the notched brass Sub-Station & Hydrotherapy Service Key for our hall door locked upstairs in G2 Radiology, so I am bolting this operating plate directly above the manifold wheel after last night's January freeze split the corroded bypass elbow. If a city inspector ever opens this wall, look behind the east glazed tiles before blaming my boiler crew for St. Damian's spinning meter. In August 1976 Dr. Vane brought in non-union quarry blasters and electrical contractors under Harbor Drainage Covenant 76-C. They tore out two cast-iron sitz tubs, sank a hoist shaft three levels into dry limestone, and spliced three yellow 13.8 kV armoured cables upstream of the G1 portico disconnect switch. On paper Havenport pays to pump storm seepage off Steep Lane; in reality every kilowatt feeds Orlov's B2 pit and B3 transformers behind the hospital's public shutoff.

Worse, Vane's crew wired the freight hoist and dumbwaiter magnetic relays through my condenser pressure switch. Opening V1 and V2 alone overshoots the gauge to eighty pounds and blows the packing; you must bleed twenty pounds back through V3 to hold sixty even. Unhooking the chained west hydrotherapy double doors gives boiler hands a clean dry retreat straight into the Atrium without crossing the glass-lined East Corridor. Stay low on your haunches across the standing water so splashes don't ring down the open hoistway before descending.`,
  },
  {
    id: 'lore_10_dumbwaiter_dispatch_slip',
    number: 10,
    title: 'G2↔B1 Specimen Dumbwaiter Service Notice',
    author: 'Orderly M. Kwon',
    date: 'March 12, 1985',
    medium: 'Document',
    roomId: 'R07',
    body: `DUMBWAITER RECOVERY INSTRUCTIONS:
One Calibrated 30A Silver Fuse Element was dispatched from the G2 Physician's Study chute down the G2↔B1 Specimen Dumbwaiter toward B1 Cold Archives. When G1 Hydrotherapy steam pressure drifted off 60 PSI and dropped the auxiliary bus, the carrier locked halfway down on its magnetic safety brake.
1. Equalize the G1 Hydrotherapy three-valve manifold to 60 PSI to restore Auxiliary Shaft Bus power.
2. Descend to B1 Security Rotunda and query Subject 09's original intake date (YYYY-MM-DD) on the CRT directory to obtain his 3-digit Dumbwaiter Brake Override.
3. Enter that 3-digit override at the B1 Cold Archives lower hatch to release the carrier, then combine the silver element with the unthreaded Brass 30A Fuse Holder.

HANDWRITTEN REVERSE — M. KWON, NIGHT ORDERLY (03:20): Plant Electrician Morales telephoned from Level B3 twenty minutes ago begging me to search Dr. Vane's study for the missing 30-amp silver fuse strip. Morales cannot leave the B3 turbine sump unattended while harbor tidewater creeps toward the transformer plinths, and Chief Sato wants the substation ready to transfer power to the hillside culvert gate before daybreak, yet Vane stripped their spare rack bare in December.

I borrowed Nurse Haldane's spare pantry passkey—ever since her brass pocket watch snapped off its chain in G2 Somnology Cubicle 11 during the 27 February ward panic at 03:14, she has kept ward keys locked in her apron—and slipped into the G2 study while Dr. Vane argued with Dr. Orlov on the landing. The heavy porcelain-and-brass cartridge body sat beside Vane's reel deck, its end-cap too green with verdigris to unthread barehanded in the dark, while the calibrated silver strip lay queued inside the dumbwaiter car under Subject 09's archive code so nobody below could claim it without Rotunda CRT lookup. Seconds after I pressed Dispatch, Callahan's patched hydrotherapy elbow blew live steam across G1 again, dropping the shaft bus and clamping the lower brake mid-run. Julian came pounding down the East Corridor toward the hiss; my dropped tray shattered four glass bottles across the tiles. Mind those shards—even crouched steps grind loud enough on broken glass to draw him straight to you.`,
  },
  {
    id: 'lore_11_b1_rotunda_standing_orders',
    number: 11,
    title: 'Sub-Basal Security Rotunda Standing Orders',
    author: 'Security Chief R. Sato',
    date: 'March 02, 1985',
    medium: 'Document',
    roomId: 'R14',
    body: `B1 ACOUSTIC REFUGE & SECURITY STANDING ORDERS:
• ACOUSTIC REFUGES: B1 Security Rotunda and B1 Anechoic Observation Gallery are lined with reverse-phase threshold emitters. Subject 09 will NOT cross into either room; shelter inside to let wounds stabilize over time and record shift logs on the reel-to-reel tape deck.
• BULKHEAD DOORS: Closing unlocked steel or ward doors behind you forces roughly a 2.5-second bash delay.
• DECOYS: Thrown borosilicate specimen vials [V] and wall pneumatic call buzzers trigger high-priority investigations across adjacent rooms, though triggering a decoy while Subject 09 is already at arm's reach in open sight will not reliably break contact.
• CRT DIRECTORY: Query original patient intake dates (YYYY-MM-DD) here before entering Cold Archives.

MEMORANDUM FOR RECORD — R. SATO: When Dr. Vane hired me away from the Harbor Constable's office in 1983, he showed me Treasury-grade grant stationery and told me Sub-Basal Tympanic Research was a joint maritime-clinical trial for decompression deafness. By the time I saw Julian Vane carried down the freight lift in December—eyes bandaged, phosphor-bronze ribs bolted through his surgical corset, dragging a steel leg caliper—my signature was already on twelve municipal quarantine vouchers and every dismissal severance paid to the daytime nurses.

Two weeks ago Surgical Orderly Hollis tried to calm Julian in B1 Intake by speaking his Christian name while cranking a buzzing hand dynamo. Julian lunged once toward the ratchet sound and fractured three ribs. After that night Dr. Orlov and I retrofitted this hexagonal Rotunda and the B1 Observation Gallery with lead-vinyl wall dampers and phase-inverted doorway coils tuned against his vagus bridge; at the threshold Julian clutches his bandaged ears in acute labyrinthine vertigo and retreats.

I cannot undo wiring the upper fire-shutter, and Vane has hidden the B3 transfer fuse to stop us evacuating. Only the Main Freight Elevator links G1 down to this B1 airlock, while descending to B2 lets you unbolt the Pneumatic Maintenance Ladder in B2 Dispatch (Shortcut 3) to climb straight back into the corridor outside this Rotunda. Shelter inside both baffled rooms to recover, pull heavy doors shut behind you to buy space, and pitch glass vials down side halls before he closes within striking reach.`,
  },
  {
    id: 'lore_12_cold_archive_manifest',
    number: 12,
    title: 'Cold Archive & Cryogenic Vault Index',
    author: 'Dr. Clara Orlov, Principal Acoustic Physicist',
    date: 'March 06, 1985',
    medium: 'Clinical Ledger',
    roomId: 'R15',
    body: `B1 CRYOGENIC VAULT & INSTRUMENTATION RETRIEVAL:
Machined aluminum Harmonic Calibration Reel Hubs (including Deck Hub 09-B) are stored inside numbered cryogenic mortuary drawers to keep coastal humidity from shedding magnetic reference oxide.
1. Cross-reference Subject 09's original G1 admission date (YYYY-MM-DD) from Head Nurse Haldane's Admissions & Sub-Basal Transfer Ledger on the B1 Security Rotunda CRT.
2. Read both his assigned Cryo Drawer designation and his 3-digit G2↔B1 Dumbwaiter Brake Override from that CRT entry.
3. Pull ONLY the verified drawer—yanking unverified frozen mortuary latches shrieks down the B1 corridor and draws Subject 09 immediately.

ARCHIVAL AUDIT NOTE — DR. CLARA ORLOV: I spent this morning auditing all three intake drawers cross-indexed from Nurse Haldane's upstairs register so an outside investigator can prove what Henrik Vane falsified. Drawer A-02 (intake 1984-10-06, M. Kestrel) holds benign sleep-spindle strip charts; Drawer B-06 (intake 1984-12-03, E. Mercer) holds routine coal-pleurisy smears. Both patients walked out of St. Damian alive because their chests lacked the trained baritone volume Henrik coveted.

Inside Subject 09's assigned drawer—stored beside our machined 7-inch aluminum hub stamped ANECHOIC DECK 09-B and the dumbwaiter solenoid routing card—Pathologist Lindqvist hid the paraffin tissue block excised from Julian's larynx on 29 November. Tonight Lindqvist placed the stained section under his lens for me: Julian did NOT have invasive squamous carcinoma wrapping the trachea. He had a localized, benign vocal-cord granuloma with post-viral paresis, matching Nurse Haldane's intake note word for word. Six weeks of silence and routine micro-laryngeal stripping would have restored his voice before Easter.

Henrik fabricated a terminal diagnosis in his private operative file to justify grafting my phosphor-bronze resonators onto his own brother, then boasted on his December tape that my rings "halted REM decay" while concealing that he had bypassed my -12 dB neural safety limiter. I built an acoustic cradle for the sleepless; Henrik turned his brother into a struck bell that cannot stop ringing.`,
  },
  {
    id: 'lore_13_observation_gallery_reel',
    number: 13,
    title: 'Reel Transcript #02: "Looking Into the Pit"',
    author: 'Dr. Clara Orlov',
    date: 'February 22, 1985',
    medium: 'Audio Transcript',
    roomId: 'R16',
    body: `[TAPE HISS — DEEP METALLIC RINGING BELOW]
BOOTH LOG DOCKET — OBSERVATION SPOOL #02: This B1 Observation Gallery is an acoustically baffled refuge overlooking the double-height B2 Anechoic Suspension Pit. Below, three concentric brass rings resonate off-frequency; mounting the assembled 09-B Calibration Reel in the B2 Acoustic Control Booth and locking onto Subject 09's phase-null waveform cancels the pit hum and unbolts the B2→B3 resonant blast hatch.

"I am logging Reel Two from the B1 Observation Gallery at 01:40, looking down through double-glazed leaded glass into the B2 Suspension Pit. Even through four inches of silica pane you can see the three concentric phosphor-bronze rings swaying half a millimeter on their tension cables above the dark well.

Four years ago in Gothenburg I designed phase-canceling acoustic enclosures to shield deep-sea divers from low-frequency hull fatigue. When Henrik Vane offered me a limestone vault beneath Havenport completely insulated from harbor surf, I believed we were building a sanctuary where chronic thalamic insomniacs could rest inside a standing acoustic null. In Henrik's December study tape he boasts that my rings proved standing waves abolish REM decay—he omits what happened on 14 December when he drove the pit amplifiers off-null to make Julian's grafted ribs project harmonic overtones without breath.

Look down at the lower catwalk beneath the middle ring. Julian is down there right now, circling the pit rail in that asymmetric orthopedic limp, tilting his bandaged skull toward the overhead brass hoops. Every off-phase pulse drives sympathetic current straight up his vagus bridge into the brainstem; he cannot sleep, cannot speak, and strikes blindly at any sharp light or clatter that pierces the ringing. Yet twice tonight, when the ring beat-frequency drifted near 108 hertz, he stopped beside the north stanchion and pressed his palm flat against the cold steel as if listening for choir pitch.

Only an exact phase-inverted lock from the B2 Control Booth can quiet those three rings simultaneously and retract the magnetic bolts on the B2-to-B3 blast hatch."`,
  },
  {
    id: 'lore_14_anechoic_waveform_spec',
    number: 14,
    title: 'Lab Note #14: Subject 09 Containment Waveform',
    author: 'Dr. Clara Orlov',
    date: 'March 09, 1985',
    medium: 'Document',
    roomId: 'R19',
    body: `B2 ACOUSTIC CONTROL BOOTH — OSCILLATOR CALIBRATION SPEC:
1. Combine the Unwound Calibration Reel Hub (09-B, from B1 Cold Archives) with Subject 09's Master Tape Spool (from B2 Cryo-Pathology), then mount the Assembled Harmonic Calibration Reel on the booth deck.
2. Align all three brass oscillator dials to Subject 09's exact phase-null profile:
   • PRIMARY FREQUENCY: 108 Hz
   • PHASE OFFSET: 180°
   • ATTENUATION: -12 dB
3. Tactical Warning: Achieving phase lock unbolts the B2→B3 Blast Hatch and discharges a brief resonant chime across the pit rings, drawing Subject 09 into B2 immediately. Unbolt the Decontamination Bypass Airlock (Shortcut 4) beforehand to loop around him cleanly.

DERIVATION NOTE — C. ORLOV: Why 108 Hz? Before Henrik locked his study, I recovered Julian's pre-operative cathedral tuning card from Bed 11's chart folder: St. Jude's pipe organ tuned its lower choir bourdon slightly flat of modern concert pitch, placing Julian's resonant chest fundamental squarely at 108 cycles per second. Henrik's four phosphor-bronze sternal ribs were filed to that exact fundamental, then driven in positive feedback until the standing wave trapped Julian's auditory cortex in perpetual waking terror.

Feeding the 09-B reference oxide tape back into the pit rings at 108 Hz with an exact 180° phase inversion—marked in white lacquer on the brass bezel—and -12 dB clinical trim cancels the standing pressure node across the lower vault without shattering the booth glass or injuring Julian further.`,
  },
  {
    id: 'lore_15_cryo_pathology_incident',
    number: 15,
    title: 'Cryo-Pathology Evacuation Memo',
    author: 'Pathologist Dr. S. Lindqvist',
    date: 'March 14, 1985',
    medium: 'Document',
    roomId: 'R20',
    body: `CRYO-PATHOLOGY RECOVERY & SUPPLY NOTE:
• Subject 09's sealed quarter-inch Acoustic Master Tape Spool rests on the stainless cryo prep bench—combine it in Inventory with the aluminum 09-B Reel Hub from B1 Cold Archives before entering the B2 Control Booth.
• Evacuation Route: Unbolt the pneumatic maintenance ladder hatch in the east corridor (Shortcut 3) for direct vertical climbs between B2 and B1 beside the Security Rotunda.
• Emergency Decoy Stock: Whenever total borosilicate specimen vials across the ward drop to zero, two reserve vials dispense automatically into emergency supply trays so nobody is stranded without a distraction.

EVACUATION ADDENDUM — DR. S. LINDQVIST: Liquid-nitrogen boil-off is pooling ankle-deep around the dewar racks because the B3 sump pumps are starving for balanced current. Before climbing the B2-to-B1 maintenance ladder tonight, I separated the wound oxide Master Tape Spool from Clara's machined aluminum hub upstairs and sealed the tape canister here in Cryo-Pathology. Yesterday evening Dr. Vane descended into B1 carrying a bulk magnetic eraser, intending to wipe Julian's baseline voice recording so Clara could never phase-cancel the pit rings or open the B3 blast hatch.

Without an empty hub Vane assumed the master oxide ribbon had already been destroyed; he walked right past my prep bench in the nitrogen mist. Take the spool, keep two glass bottles in your coat pocket to draw Julian clear of narrow doors, and do not wind your lamp where the corridor dead-ends.`,
  },
  {
    id: 'lore_16_bypass_airlock_note',
    number: 16,
    title: 'B2 Figure-Eight Circulation Advisory',
    author: 'Security Chief R. Sato',
    date: 'March 13, 1985',
    medium: 'Document',
    roomId: 'R21',
    body: `B2 CIRCULATION & SURVIVAL ADVISORY:
Before locking the B2 Control Booth oscillator or cranking your Lux-Meter dynamo [Hold R], physically unbolt both B2 mechanical shortcuts from their latch sides:
1. Shortcut 3 — Pneumatic Maintenance Ladder in B2 Pneumatic Dispatch climbing directly up to the B1 Service Corridor outside the Security Rotunda refuge.
2. Shortcut 4 — Decontamination Bypass Airlock joining the Anechoic Pit walkway (latch side) and B2 Pneumatic Dispatch, completing a continuous figure-eight loop through Cryo-Pathology and the Control Booth.

FIELD LOG — R. SATO: At 22:40 tonight I escorted Dr. Lindqvist to the B2 maintenance ladder so he could carry his biopsy ledger to the upper stairs, only to confirm what Boilerman Callahan warned me on G1: the portico fire-shutter has already dropped on emergency containment current, sealing Lindqvist and Kwon inside the upper infirmary until someone completes the B3 substation transfer from below.

Electrician Morales and Dr. Orlov volunteered to descend with me to B3 once the blast hatch unbolts. We have enough antiseptic syrettes and silver-zinc cells cached along the route for one determined runner if we fail. Remember how Julian hunts on this level: pyramidal anechoic wedges swallow distant echoes, yet any boot step on stray glass or an impatient dynamo crank brings him striding around the pit balcony within seconds. Never let yourself get cornered against a locked airlock leaf—open the bypass first, break sightline around the central pit wall, and move crouched in the dark.`,
  },
  {
    id: 'lore_17_b3_turbine_sump_log',
    number: 17,
    title: 'B3 Sump Seepage & Freight Override Log',
    author: 'Plant Electrician D. Morales',
    date: 'March 14, 1985',
    medium: 'Document',
    roomId: 'R23',
    body: `B3 SUMP & FREIGHT LIFT OVERRIDE:
Harbor seepage floods the B3 Turbine Sump—standing footsteps splash loudly across the entire vault, whereas crouching cuts splash noise sharply (except over broken glass, which still crunches underfoot). Engage the Freight Lift Call Override (Shortcut 5) beside the east substation landing first so the main elevator cage services G1, B1, and B3 continuously.

Waiting near the east landing since midnight for Kwon's 30A silver fuse strip stalled in the dumbwaiter. Vane's 1976 quarry cut sits below high tide; without balanced substation transfer to unseal the hillside culvert, brackish harbor water will claim this floor.`,
  },
  {
    id: 'lore_18_substation_load_sheet',
    number: 18,
    title: 'B3 High-Voltage 3-Phase Load Schedule',
    author: 'Plant Electrician D. Morales',
    date: 'March 15, 1985',
    medium: 'Document',
    roomId: 'R24',
    body: `13.8 kV SUB-BASAL SUBSTATION — CULVERT TRANSFER:
1. Seat the Restored 30A Cartridge Fuse in the auxiliary bus cradle.
2. Close the exact breaker combination yielding 120 kW balanced at 40 kW per phase (A, B, C); exceeding 50 kW on any phase trips the overload relay safely:
   • Feeder Breaker S1: Phase A +25 kW | Phase B +15 kW | Phase C +0 kW
   • Feeder Breaker S2: Phase A +0 kW  | Phase B +25 kW | Phase C +25 kW
   • Feeder Breaker S3: Phase A +15 kW | Phase B +0 kW  | Phase C +15 kW
   • Tie Compensator S4: Phase A +20 kW | Phase B +20 kW | Phase C -10 kW

Morales, 04:10 — Lugs torqued; once 40/40/40 kW holds, seal the Acoustic Vault south.`,
  },
  {
    id: 'lore_19_containment_purge_protocol',
    number: 19,
    title: 'Emergency Reel #03: Acoustic Vault Containment',
    author: 'Dr. Clara Orlov & Chief R. Sato',
    date: 'March 15, 1985 — Final Entry',
    medium: 'Audio Transcript',
    roomId: 'R25',
    body: `[CRIMSON ALARM RELAY CLICK — BREATHLESS MAGNETIC REEL RECORDING]
"Listen closely—whoever reaches B3 after us. Substation current feeds the Brick Storm-Drain Culvert gate, but its safety interlock stays bolted while Subject 09 roams free. Trigger West Approach Lure (#1) first, wait for Julian to enter the gallery, then fire Vault Cell Lure (#2) inside the central Anechoic Lock. The instant he physically steps inside the chamber, throw the Manual Containment Bulkhead Lever.

Once the bulkhead dogs shut, the amber culvert floodgate release engages automatically. Sato and I remain behind to guard the seal—give Julian silence at last."`,
  },
  {
    id: 'lore_20_dawn_epilogue_certificate',
    number: 20,
    title: 'Final Utility Disconnect & Acoustic Seal Field Note',
    author: 'Mara Solis, Structural Reclamation Inspector',
    date: 'November 18, 1994 — 05:48',
    medium: 'Document',
    roomId: 'R26',
    body: `BUREAU OF CONDEMNED STRUCTURES — AMENDED CERTIFICATION #88-412-B
Sub-basal 13.8 kV feeder bus severed at the lower hillside Dawn Courtyard riser; portico meter dead at 0 kW. B3 Anechoic Lock mechanically dogged; unlisted levels B1–B3 entered as Permanent Geological & Acoustic Quarantine—wrecking crews restricted strictly to the 1928 G1/G2 brick superstructure above slab grade.

Havenport's rain has slackened to silver mist before dawn. No hum rises from the culvert behind me. Walking out the iron street gate now.`,
  },
];
