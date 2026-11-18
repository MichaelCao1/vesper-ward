# Development and verification

VESPER WARD was built autonomously in approximately 18 hours from one master prompt. **GPT-6.2 SOL Ultra** directed the project in Codex and handled coordination, review and acceptance. **Gemini 4 Carbon** wrote and iterated on the game code in Gemini Desktop Task mode. The agents used English to coordinate. One master prompt set the brief, and agent-authored follow-ups drove the implementation and QA cycles.

The game uses TypeScript, Vite, Three.js, WebGL2 and Web Audio. Architecture, textures, props, the creature rig and audio are generated locally. Browser storage holds checkpoint saves and accessibility preferences.

## Measured verification

- Clean installation and production build passed. The title became interactive in approximately 370 ms on the test Mac. A loopback-only browser probe passed startup, New Game, the first document and reload.
- A full normal-control run on R8 reached the playable courtyard, Credits and Return to Title. R9 changed twenty archive body strings. The R9 normal route exercised all five shortcuts, both examinations and recipes, electrical transfer and the first lure before a host restart interrupted the run. A separate R9 test from an explicitly synthetic checkpoint verified both lures, physical vault entry, sealing, the courtyard, Credits and Return to Title with public controls. All twenty archive texts matched the source and their reading panes passed reachability checks.
- On an Apple M5 with hardware ANGLE Metal WebGL2 at 1280 × 720, a 180-second stationary benchmark spanning five zones measured 59.88 median FPS, 16.70 ms p95 and 16.80 ms maximum. This benchmark measures fixed scene views. The R8 movement trace separately recorded an isolated 101.2 ms interval during an automatic ladder climb.
- The six-segment first-time model estimates 56.21 minutes in its central full-reading scenario and 43.40–68.81 minutes across the modeled assumptions. An unassisted human playtest remains open.
- The B2 map has a slightly clipped label. Reel recordings use synthesized tape sound with written transcripts.

The public repository includes the runnable source, build configuration, player guide, provenance, and spoiler map.
