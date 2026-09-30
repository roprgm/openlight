# OpenLight

A professional photo editor with little, readable code: Vite, React, [vgpu](https://vgpu.sh) on WebGPU, Bun, and Biome.

Start with [ARCHITECTURE.md](ARCHITECTURE.md) to find the affected code and its layer rules. [CONTEXT.md](CONTEXT.md) names domain terms. For UI changes, read [DESIGN.md](DESIGN.md) for the library and editor components. [REVIEW.md](REVIEW.md) covers verification, and [API.md](API.md) documents `window.openlight`.

## Setup

```sh
bun install
bun dev
bunx --no-install playwright install chromium
```

The last command installs the Chromium build that the project's Playwright version expects; it is needed once per Playwright version for browser tests and scripted screenshots. `bun run test:browser` starts Vite itself and runs WebGPU on SwiftShader; reuse the launch flags in [playwright.config.ts](playwright.config.ts) for any other scripted browser.

The experimental assistant shows only at `/?assistant` and answers through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway). `bun dev` serves the app alone; to try the assistant, run `vercel dev` with `AI_GATEWAY_API_KEY` in `.env.local`.

| Command | Checks |
| --- | --- |
| `bun run check` | Format and lint; writes fixes. |
| `bun run build` | Types and production build. |
| `bun run test` | Bun tests with `vgpu/mock`; seconds. |
| `bun run test:browser [file]` | Chromium tests with real pixels; minutes for the whole suite. |

Run the first three on code changes; CI runs them too. Run browser tests for what a change can affect, as [REVIEW.md](REVIEW.md#verify) describes.

## Conventions

- Everything committed is in English: code, comments, docs, UI text, commit messages, and PRs, even when the conversation is in another language.
- File names use kebab-case. Prefer named exports; use `@/` across folders and relative imports within one.
- Files read from small to large: define a function above the functions that use it.
- Comment only what the code cannot say.
- Keep Tailwind classes inline; use `cva` for local variants when needed.

## Quality

- Code quality comes first and technical debt is not accepted: no workarounds, dead code, or TODOs in place of a fix. When the right fix is larger than the request, say so instead of patching around it.
- Change behavior at its owner and keep the diff within the request. Preserve unrelated UI and behavior. Add only the tests, helpers, abstractions, or docs the change needs.
- Give each module, component, and function one responsibility. Start with direct functions and library calls; prefer a few repeated lines over coupling unrelated behavior.
- Drive behavior from the state that causes it, such as props or document state, never from incidental DOM structure, selectors, or timing.
- Keep control flow linear with guard clauses and `const`. Avoid nested ternaries and dense logic in JSX.
- Use precise types and one source of truth; avoid casts. Validate external input at its boundary and keep useful errors.

## Tests

Tests follow what a person would verify: open an image, use a tool, undo, export, and check the output. Add or extend one when a change adds or alters such a workflow or its processing, or fixes a regression. Core algorithms such as render order and resource reuse may have focused unit tests. Layout, styling, and copy changes are checked by looking at the app, not by tests. Tests run offline: the browser fixture fails any request beyond the dev server.

## Finishing

- When a change alters the structure [ARCHITECTURE.md](ARCHITECTURE.md) describes, confirm it with the user and update that file in the same change.
- Before a substantial change's PR is ready, review it as [REVIEW.md](REVIEW.md) describes; after a small one, offer a review instead.
- Keep PR descriptions short with the [template](.github/pull_request_template.md). Include [screenshots](REVIEW.md#screenshots) for new features and substantial UI changes. Generated output goes to the PR, never into the repository.
