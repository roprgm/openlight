# Review

A review checks a change before its PR is ready: substantial changes get one, and anyone can ask for one. Code should stay a small, readable example of how the application works; [AGENTS.md](AGENTS.md) and [ARCHITECTURE.md](ARCHITECTURE.md) hold the rules.

## Scope

Read what changed: the diff against the base and what it was meant to do. Then follow the changed code to the user actions that reach it. That set is what the review verifies; workflows the change cannot reach need no check. A sidebar layout change does not call for export tests.

## Verify

`bun run check`, `bun run build`, and `bun run test` are fast; run them for any code change. Beyond that, pick the cheapest check that would catch a regression in the scope:

| Change | Check |
| --- | --- |
| Documentation | Links and the references it describes. |
| Layout, styling, copy | Look at the affected screens at the widths they change; attach a screenshot, before and after for existing UI. |
| Document, edits, history, loaders | The Bun tests covering them. |
| Processing, shaders, rendering | The browser tests of that feature, e.g. `bun run test:browser tests/vignette.e2e.ts`; before/after measurements when GPU work changes ([PERFORMANCE.md](PERFORMANCE.md)). |
| Shared primitives in `core/` or `components/` | The browser tests of the workflows that use them. |

Run the whole browser suite only when a change cuts across the editor. A failure that also happens on the base is not the change's; report it as a gap.

## Read the diff

- **Size:** Does the change match the request? Could it be smaller or live closer to the behavior it changes?
- **Ownership:** Does each module keep one responsibility and stay in its layer? Does feature behavior stay in its feature?
- **State:** Is each fact stored once and behavior driven by it rather than by DOM structure or timing? Is external input validated at its boundary?
- **Lifetime:** Do edits, grouping, cancellation, and undo work together? Can async work outlive its document? Is every resource and subscription released?
- **Tests:** Would a user workflow test fail if the change broke? Flag tests that protect no workflow or regression.
- **Architecture:** If the structure changed, was it agreed and is [ARCHITECTURE.md](ARCHITECTURE.md) updated?

## Report

For each finding, name the code, the concrete problem, and the smallest fix; separate required changes from optional ones. List the checks run and any gaps.
