# OpenLight

A professional photo editor with little, readable code: Vite, React, [vgpu](https://vgpu.sh) on WebGPU, Bun, and Biome.

[ARCHITECTURE.md](ARCHITECTURE.md) maps the code and its layer rules; start there to find what a request touches. [CONTEXT.md](CONTEXT.md) names domain terms, [DESIGN.md](DESIGN.md) covers UI patterns, [REVIEW.md](REVIEW.md) covers reviewing and verifying a change, and [API.md](API.md) documents `window.openlight`. Write code, comments, docs, and UI text in English.

## Setup

```sh
bun install
bun dev
bunx --no-install playwright install chromium
```

The last command installs the Chromium build that the project's Playwright version expects; it is needed once per Playwright version for browser tests and scripted screenshots. `bun run test:browser` starts Vite itself and runs WebGPU on SwiftShader; reuse the launch flags in [playwright.config.ts](playwright.config.ts) for any other scripted browser.

| Command | Checks |
| --- | --- |
| `bun run check` | Format and lint; writes fixes. |
| `bun run build` | Types and production build. |
| `bun run test` | Bun tests with `vgpu/mock`; seconds. |
| `bun run test:browser [file]` | Chromium tests with real pixels; minutes for the whole suite. |

Run the first three on code changes; CI runs them too. Run browser tests for what a change can affect, as [REVIEW.md](REVIEW.md#verify) describes.

## Code

- Find where the behavior lives before editing, and change it there. The size of a change follows the request: no tests, helpers, abstractions, or docs it does not need.
- Drive behavior from the state that causes it, such as props or document state, never from incidental DOM structure, selectors, or timing.
- Give each module and component one responsibility. Start with direct functions and library calls; prefer a few repeated lines over coupling unrelated behavior.
- Keep control flow linear with guard clauses and `const`. Avoid nested ternaries and dense logic in JSX.
- Use precise types and one source of truth; avoid casts. Validate external input at its boundary and keep useful errors.
- Prefer named exports. Define functions above their consumers. Comment only what the code cannot say.
- Keep Tailwind classes inline and use `cva` for variants. Text has one size; express hierarchy with color and weight.

## Tests

Tests follow what a person would verify: open an image, use a tool, undo, export, and check the output. Add or extend one when a change adds or alters such a workflow or its processing, or fixes a regression. Core algorithms such as render order and resource reuse may have focused unit tests. Layout, styling, and copy changes are checked by looking at the app, not by tests. Tests run offline: the browser fixture fails any request beyond the dev server.

## Finishing

- When a change alters the structure [ARCHITECTURE.md](ARCHITECTURE.md) describes, confirm it with the user and update that file in the same change.
- Before a substantial change's PR is ready, review it as [REVIEW.md](REVIEW.md) describes; after a small one, offer a review instead.
- Keep PR descriptions short with the [template](.github/pull_request_template.md). Attach screenshots and other generated output to the PR; do not commit them.
