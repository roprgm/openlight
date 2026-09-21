# OpenLight

Build a professional photo editor with little, readable code. Vite, React, vgpu, Bun, and Biome.

Write committed code, comments, documentation, and UI text in English. Use [CONTEXT.md](CONTEXT.md) for domain terms. [CONTRIBUTING.md](CONTRIBUTING.md#development) covers setup; [API.md](API.md) documents browser commands; [REVIEW.md](REVIEW.md) guides reviews.

## Simplicity

- Give each module, function, and component one coherent responsibility. Entry points compose; resource owners manage their own lifecycles.
- Judge simplicity across the whole change, including callers, cleanup, tests, helpers, scripts, and documentation. Remove unnecessary work rather than compressing syntax or adding forwarding helpers. Keep cohesive work together; use no arbitrary line-count limits.
- Start with direct functions and library calls. Add abstractions, dependencies, validation, scheduling, or caching for a current requirement. Prefer a few repeated lines over coupling unrelated behavior.
- Extract a component when a region owns distinct state, refs, or behavior. Keep helpers local unless they have a separate responsibility or a real shared use. Define functions above their consumers.
- Keep control flow linear: guard clauses, braces, and `const` by default. Avoid nested ternaries and dense logic in JSX; use early returns or components for meaningful branches.
- Model actual states with precise types and explicit dependencies. Keep one source of truth; avoid casts and permissive types that conceal mismatches. Validate external input at its boundary and preserve useful errors.
- Prefer named exports and imports. Use a default export when an integration requires or clearly benefits from it.

## Layers and ownership

| Layer | Owns |
| --- | --- |
| 0 — `lib/` | Low-level code independent of OpenLight: math and utilities that could be standalone libraries. Keep it here when maintaining the small implementation is cheaper than a dependency, or when it is a candidate for extraction. |
| 1 — shared primitives | `core/` owns document, image, and renderer infrastructure without React. Reusable `components/` and `hooks/` provide UI primitives and React bindings above it. |
| 2 — `features/` | Removable product capabilities. A feature owns its processing, shaders, parameters, commands, components, and hooks as needed. Most product behavior belongs here. |
| 3 — `app/` | Application shell, user entry points, and explicit composition of features and shared primitives. |

Dependencies between layers point downward. Features do not import each other; `app/` connects them. Shared primitives must not import concrete features. Being reusable within OpenLight or independent of React does not qualify code for `lib/`.

`core/document` owns the serializable scene contract, history, and document resources; features own their defaults, validation, edits, and processing. `core/image` owns image sources, decoding, geometry, and the working color space. `core/renderer` exposes node composition, execution, transforms, and display through its module entry point. Keep module internals private unless a caller needs them; do not add an application-wide barrel.

Keep ordinary feature changes in the feature, its tests, and explicit app composition. Change shared primitives when a concrete requirement needs a new capability. Features need neither identical file layouts nor a universal plugin interface. Keep the histogram in its feature.

`src/` holds entrypoints, ambient types, and global styles. Use `@/` across folders and relative imports within a folder. `src/main.tsx` mounts the runtime and providers. `app/editor/modes.tsx` composes modes: a `Panel` uses the shared canvas; a `View` supplies its own viewport.

## Engine and React

Keep document edits and rendering callable without React, a mounted UI, or an implicit active document. Pass workspace, document, and GPU dependencies explicitly. Feature processing must be importable without its React panel; keep browser input and display adapters outside processing.

Each document owns a vanilla Zustand scene store, history, and image resources. Scenes contain immutable, serializable content and image-source IDs; files and GPU resources stay outside history. The workspace owns document replacement and loading state.

UI controls and browser commands call the same imperative edits. History groups changes without knowing loaders or tools: a slider or curve gesture is one edit; cancellation restores the previous scene. Preview settings and navigation stay outside content history.

React composes controls and mounts engine outputs. The engine owns GPU resources, rendering, and derived data such as histogram bins; frame data stays outside React state and props. Hooks and providers connect stable instances to mounting and cleanup. Every resource owner disposes what it creates.

## Styling

Keep Tailwind classes inline. Reuse presentation through components or repeat classes, whichever is simpler; do not share class-string constants across files. Use `cva` for variants and `src/index.css` for app-global tokens such as shadows and typography. Text has one size, set on `body` in `src/index.css`; express hierarchy with color and weight, not size.

## GPU invariants

- Use `vgpu-react` for React bindings and `vgpu` for GPU operations. Create pipelines once per engine instance and reuse them.
- Processing uses the [render node contract](PERFORMANCE.md#instrumentation). Features declare passes and inputs; the graph owns intermediate textures and timing. Connect nodes in app composition, keeping the engine independent of concrete features.
- Keep `.wgsl` beside its owner. The Vite loader and ambient types are configured.
- The working space is linear Rec.2020 in `rgba16float`. Decoders convert into it; display converts out. Processing outputs preserve the input format and primaries unless the operation explicitly converts them.
- The adjustment shader's parameters use UI units. Its fitted constants are calibration data; preserve them when reorganizing code.
- Layers process the source in stack order; the image layer's adjustments and tone curve run last, on the composite, so a local exposure sees the light a global exposure would compress.
- Preserve HDR headroom through exposure, curves, and vibrance. Exposure clips negatives and applies one luminance gain to all channels. `display()` in `core/image/color.wgsl` maps out-of-gamut colors toward their luminance.
- TIFF and camera RAW use `raw-webgpu`. OpenLight adapts package resources to document ownership; codec implementation and coverage belong to the package.

## Tests and completion

For routine feature changes, prefer one short integration scenario that follows how a user would verify the change. For editing changes, load a suitable fixture, apply the operation, check the result, change a parameter, and undo. Reuse existing fixtures, helpers, and editing steps. Add cases for distinct failure modes or regressions; avoid repeating coverage of shared controls and history for each feature.

Check meaningful output using a few representative samples, expected relationships, and tolerances. Assert rendered results when processing changes; state changes alone do not prove the effect works. Detailed numerical references and exhaustive parameter matrices need a concrete accuracy requirement or regression.

Core algorithms also merit focused unit tests, especially rendering order, branch/merge connections, and resource reuse. Use Bun and real application modules with `vgpu/mock` for engine orchestration; the mock does not execute shaders. Use Playwright for rendered pixels, DOM interaction, and real format fixtures. Maintain the semantic [control API](API.md) for local, CI, and remote use. Wait for observable results; avoid production completion tracking added only for tests.

For code changes, run `bun run check`, `bun run build`, `bun run test`, and `bun run test:browser` before a commit. Browser setup and focused commands are in [CONTRIBUTING.md](CONTRIBUTING.md#validation). For documentation-only changes, check the diff and affected references.

Prepare evidence during implementation and include it in the initial PR description, using the [PR template](.github/pull_request_template.md). Lead with the problem and resulting behavior. Keep prose short and use compact comparison tables. Generated screenshots, logs, reports, and benchmark samples belong in ignored output directories and PR/CI attachments, not in Git. Commit test fixtures when maintained tests need them. Omit work logs and repeated explanations.

Every code PR includes actual application screenshots or rendered output demonstrating the result. UI additions or changes require screenshots of the affected interface in context, with the new or changed controls visible for visual approval; rendered output alone is insufficient. Show before/after for changes to existing UI or image output, representative states for new UI, and the affected workflow for nonvisual code changes. Compare the same fixture under matching conditions and state what varies. Embed accessible images in the description, name the fixture and settings, and verify the published links. Documentation-only changes may mark visual evidence not applicable.

Use image-quality metrics for a concrete quality claim or regression; ordinary correctness can use representative output checks. State metric units and limits, and do not generalize from synthetic fixtures to real photos. Keep quality results separate from rendering timings.

Assess performance on every code change; changes affecting GPU work require reproducible before/after evidence under [PERFORMANCE.md](PERFORMANCE.md). Report unavailable checks and measurements as verification gaps.

Update existing documentation for changed contracts or shared workflows; a feature does not need a separate guide. Link rules instead of duplicating them. Keep setup instructions portable; host-specific paths and workarounds stay outside the repository. Describe existing APIs accurately and label unimplemented designs explicitly.
