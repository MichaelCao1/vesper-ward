# Asset provenance and license ledger

## Project-authored runtime assets
All game-specific models, textures, story/lore, UI, effects and audio are generated/authored in this project through Gemini Desktop Carbon Task under Codex direction. No downloaded model, photograph, sound recording, paid API asset or proprietary game material is included. Project-authored content is available under the [MIT License](LICENSE). The gameplay screenshot in the README comes from a local test run.

| Asset class | Exact local origin | License / provenance |
|---|---|---|
| Architecture, props, doors, scenery and fixtures | src/world/worldBuilder.ts and worldData.ts | Original procedural geometry, built from Three.js primitives; no external model files. |
| Item examination models and engraved labels | src/world/itemExaminer3D.ts, src/assets/proceduralTextures.ts | Original procedural meshes and authored Canvas textures. |
| Cantor subject, rig and animation | src/systems/cantorAI.ts | Original procedural entity design and animation; no imported character or copied IP. |
| Lux-Meter housing, crank, lamp and needle data | src/systems/luxMeter.ts, src/ui/uiManager.ts | Original procedural design and instrument UI. |
| Terrazzo, celadon, tile, concrete, wood, brass, grate, glass, brick and wear maps | src/assets/proceduralTextures.ts | Original seeded Canvas-generated color/roughness/bump maps. |
| Plaques, X-rays and watch/fuse engravings | src/assets/proceduralTextures.ts | Original Canvas text and line drawings. Uses host fonts, no font binary redistribution. |
| Ambience, footsteps, impacts, lures, threat and instrument audio | src/assets/audioEngine.ts | Original local Web Audio synthesis (oscillators, generated buffers, filters, envelopes and spatial panners); no audio recordings/downloads. |
| Narrative, lore, item text and puzzle clues | src/world/itemsAndLore.ts | Original authored text for this demo. |
| Game UI, schematic drawings and gamma swatches | src/ui/uiManager.ts, src/styles/main.css | Original authored HTML/CSS/SVG and procedural diagrams. |
| Favicon | index.html | Original inline SVG instrument mark; no external logo. |
| Atmospheric grade shader | src/main.ts | Project-authored GLSL vignette/grain/gamma shader. |
| PBR shaders, primitive constructors and postprocessing modules | node_modules/three, including examples/jsm/postprocessing | Three.js 0.170.0, MIT, https://github.com/mrdoob/three.js; local LICENSE retains author notice. |

## Fonts
No font files or font CDN are bundled. CSS uses host-installed fallbacks: Iowan Old Style, Palatino Linotype/Palatino/Georgia for archival serif; Apple system/BlinkMacSystemFont/Segoe UI/Helvetica/Arial sans; ui-monospace/SF Mono/Menlo/Monaco/Consolas for instruments. Generated plaque/engraving canvases also request Georgia/serif or monospace. These fonts remain supplied by the operating system/browser under their own licenses; they are **not** described as MIT/CC0 project assets.

## Runtime and build dependencies
Only `three` is a browser runtime package. Vite, TypeScript, declarations, bundlers and their dependencies are development/build tools, not external runtime asset services. All lockfile tarballs are from registry.npmjs.org; npm install is the only dependency download step. The table includes all optional platform variants in the lockfile; only Darwin ARM64 variants are installed here.

| Package | Locked version | Declared license | Role | Origin |
|---|---|---|---|---|
| `@esbuild/aix-ppc64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/android-arm` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/android-arm64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/android-x64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/darwin-arm64` | 0.21.5 | MIT | optional build platform | git+https://github.com/evanw/esbuild.git |
| `@esbuild/darwin-x64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/freebsd-arm64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/freebsd-x64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/linux-arm` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/linux-arm64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/linux-ia32` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/linux-loong64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/linux-mips64el` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/linux-ppc64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/linux-riscv64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/linux-s390x` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/linux-x64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/netbsd-x64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/openbsd-x64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/sunos-x64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/win32-arm64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/win32-ia32` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@esbuild/win32-x64` | 0.21.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-android-arm-eabi` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-android-arm64` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-android-x64` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-darwin-arm64` | 4.68.5 | MIT | optional build platform | git+https://github.com/rollup/rollup.git |
| `@rollup/rollup-darwin-x64` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-freebsd-arm64` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-freebsd-x64` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-linux-arm-gnueabihf` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-linux-arm-musleabihf` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-linux-arm64-gnu` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-linux-arm64-musl` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-linux-loong64-gnu` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-linux-loong64-musl` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-linux-ppc64-gnu` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-linux-ppc64-musl` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-linux-riscv64-gnu` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-linux-riscv64-musl` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-linux-s390x-gnu` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-linux-x64-gnu` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-linux-x64-musl` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-openbsd-x64` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-openharmony-arm64` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-win32-arm64-msvc` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-win32-ia32-msvc` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-win32-x64-gnu` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@rollup/rollup-win32-x64-msvc` | 4.68.5 | MIT | optional build platform | https://registry.npmjs.org/ |
| `@tweenjs/tween.js` | 23.1.3 | MIT | development/build | https://github.com/tweenjs/tween.js.git |
| `@types/estree` | 1.0.10 | MIT | development/build | https://github.com/DefinitelyTyped/DefinitelyTyped.git |
| `@types/stats.js` | 0.17.4 | MIT | development/build | https://github.com/DefinitelyTyped/DefinitelyTyped.git |
| `@types/three` | 0.170.0 | MIT | development/build | https://github.com/DefinitelyTyped/DefinitelyTyped.git |
| `@types/webxr` | 0.5.24 | MIT | development/build | https://github.com/DefinitelyTyped/DefinitelyTyped.git |
| `@webgpu/types` | 0.1.74 | BSD-3-Clause | development/build | git+https://github.com/gpuweb/types.git |
| `esbuild` | 0.21.5 | MIT | development/build | git+https://github.com/evanw/esbuild.git |
| `fflate` | 0.8.3 | MIT | development/build | https://github.com/101arrowz/fflate |
| `fsevents` | 2.3.3 | MIT | optional build platform | https://registry.npmjs.org/ |
| `meshoptimizer` | 0.18.1 | MIT | development/build | https://github.com/zeux/meshoptimizer |
| `nanoid` | 3.3.20 | MIT | development/build | ai/nanoid |
| `picocolors` | 1.1.1 | ISC | development/build | alexeyraspopov/picocolors |
| `postcss` | 8.5.33 | MIT | development/build | postcss/postcss |
| `rollup` | 4.68.5 | MIT | development/build | git+https://github.com/rollup/rollup.git |
| `source-map-js` | 1.2.2 | BSD-3-Clause | development/build | 7rulnik/source-map-js |
| `three` | 0.170.0 | MIT | browser runtime | https://github.com/mrdoob/three.js |
| `typescript` | 5.9.3 | Apache-2.0 | development/build | https://github.com/microsoft/TypeScript.git |
| `vite` | 5.4.21 | MIT | development/build | git+https://github.com/vitejs/vite.git |

## Bundled notices and audit evidence
- Three.js: node_modules/three/LICENSE (MIT, three.js authors).
- Vite: node_modules/vite/LICENSE.md includes MIT plus bundled Apache-2.0, BSD-2-Clause, BlueOak-1.0.0, CC0-1.0 and ISC notices.
- Rollup: node_modules/rollup/LICENSE.md includes MIT, ISC and 0BSD notices.
- TypeScript: node_modules/typescript/LICENSE.txt and ThirdPartyNoticeText.txt include Apache-2.0 and additional Unicode/W3C/WHATWG-related notices.
- Optional binary package manifests declare the parent project's MIT license; standalone license files may be supplied by the parent esbuild/Rollup package.
- Independent read-only dependency audit found all 67 lock package records declare licenses; the current clean install contains 20 packages on this host, including the optional Darwin `fsevents` package.

## Runtime verification

The production bundle successfully opened the title, started a new game, displayed the first document and reloaded with the browser restricted to its loopback origin. See the [development notes](DEVELOPMENT.md) for the measured scope.
