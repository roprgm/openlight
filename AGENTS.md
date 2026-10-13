# OpenLight

A professional photo editor with little, readable code: Vite, React, [vgpu](https://vgpu.sh) on WebGPU, Bun, and Biome. Less is more: the smallest correct change wins, and technical debt is not accepted. [CONTEXT.md](CONTEXT.md) names domain terms; [API.md](API.md) documents `window.openlight`.

## Commands

`bun install`, then `bun dev`. On every code change run `bun run check` (writes fixes), `bun run build`, and `bun run test` (Bun; GPU tests use `vgpu/mock`). `bun run test:browser [file]` runs `*.e2e.ts` in Chromium with real pixels; install its browser once per Playwright version with `bunx --no-install playwright install chromium`. It starts its own Vite: stop any other Vite server first, since concurrent servers reload each other's pages mid-test. Any other scripted browser reuses the launch flags in [playwright.config.ts](playwright.config.ts). The assistant at `/?assistant` needs `vercel dev` with `AI_GATEWAY_API_KEY` in `.env.local`.

## Structure

- `lib/`: code that could ship as a standalone library; being shared or React-free does not qualify.
- `core/`: document, image, and renderer, without React. `components/` and `hooks/`: UI primitives and React bindings.
- `features/<name>`: one removable capability, usually `model.ts`, `edits.ts`, `pass.ts` with its `.wgsl`, and `controls.tsx`. Most product behavior lives here.
- `app/`: shell, entry points, and the explicit composition of features.

Dependencies point down: `core/`, `components/`, and `hooks/` never import features, and features never import each other; `app/` connects them. Keep module internals private; no application-wide barrel.

Edits and rendering run without React or an implicit active document: pass the workspace, document, and GPU explicitly. UI controls, `window.openlight`, and commands call the same edits; a change to them updates API.md in the same change. The workspace owns document replacement; each document owns its scene, history, and resources. Scenes hold immutable, serializable content; files and GPU resources stay outside history. A gesture is one edit; preview and navigation stay outside history. Async work never outlives its document.

`/api` runs unbundled in Node: the modules it reaches import other app modules only as types and name `.js` files instead of `@/`. The model and its key stay on the server.

Confirm changes to this structure with the user and update this section in the same change.

## Performance

Frame rate and low memory are product requirements, on phones as much as desktops.

- Pixel work runs on the GPU. Read back only what the result needs; await `queue.onSubmittedWorkDone()` before reading GPU output through a 2D canvas, or `convertToBlob` stalls a second.
- Work follows what changed, never every render or pointer event; per-frame data such as histogram bins stays out of React state. Create pipelines once per engine; keep `.wgsl` beside its owner.
- Render at the reduction the display needs; avoid full-size intermediates. Reuse textures instead of allocating and freeing them. Every owner disposes what it creates. Hidden UI does not mount.
- The working space is linear Rec.2020 `rgba16float`; 8-bit sources stay 8-bit until a pass converts them. Preserve HDR headroom and alpha until display or export. Fitted shader constants are calibration data: never retune them by hand.
- GPU changes carry before/after measurements in the PR: same fixture, device, and flags; first render apart from warm repeats; median and p95; a new effect also reports its neutral or bypassed cost; GPU time from vgpu's `timer(gpu)`, or reported as unavailable, never replaced by CPU time. Memory counts retained rasters and Remove fields alongside textures. SwiftShader numbers describe SwiftShader only. Run `bun run test:browser --config playwright.bench.config.ts --grep <workload>` alone. `?stats` shows fps and every texture and buffer allocation.

## UI

- Use [`@roprgm/ui`](https://ui.roprgm.com) with its defaults and variants: `Button` or `IconButton` for actions, `Menu` for commands, `Popover` for settings, `Select` for choices. Override styling only for a demonstrated editor need; an existing override is not a precedent.
- Compose the editor from `components/editor`; `components/ui` holds only what the library lacks. Features describe numbers as `Parameter`s, drawn as sliders on desktop and dials on mobile. New UI keeps the padding and gaps of the components around it.
- `useDesktopLayout` is the one layout switch. State that outlives a layout lives above `EditorLayout`, and the canvas never remounts across it.
- Keep Tailwind classes inline; use `cva` for local variants.

## Code

- Everything committed is in English, even when the conversation is not.
- kebab-case files, named exports, `@/` across folders and relative imports within one. Define a function above its users. Comment only what the code cannot say.
- No workarounds, dead code, or TODOs in place of a fix. When the right fix is larger than the request, say so.
- Change behavior at its owner and keep the diff within the request; add only the tests, helpers, abstractions, or docs it needs.
- One responsibility per module, component, and function. Direct calls first; a few repeated lines over coupling unrelated behavior.
- Drive behavior from the state that causes it, never DOM structure, selectors, or timing.
- Linear control flow with guard clauses and `const`; no nested ternaries or dense logic in JSX.
- Precise types, one source of truth, no casts. Validate external input at its boundary with useful errors.

## Tests

Tests follow what a person verifies: open an image, use a tool, undo, export, check the output. Add one when a workflow or its processing changes or a regression is fixed; core algorithms may have unit tests. Layout, styling, and copy are checked by looking at the app. Tests run offline: the browser fixture fails any request beyond the dev server.

## Review and PRs

- Verify what the change can reach with the cheapest check that catches a regression: Bun tests for document, history, and loaders; the feature's `*.e2e.ts` for processing and rendering; the whole suite only when a change cuts across the editor; the affected screens for UI. A failure that also happens on the base is a gap to report.
- Review substantial changes before the PR is ready; offer a review after small ones. Name each finding's code, problem, and smallest fix, separating required from optional. A simpler version that removes code without losing behavior is a required change.
- Short PR descriptions with the [template](.github/pull_request_template.md). New features and substantial UI changes show before/after screenshots with the same fixture and viewport, uploaded as PR attachments. Generated output never goes in the repository.
