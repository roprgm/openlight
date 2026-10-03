# Review

A review checks a change before its PR is ready: substantial changes get one, and anyone can ask for one. Code should stay a small, readable example of how the application works; [AGENTS.md](AGENTS.md) and [ARCHITECTURE.md](ARCHITECTURE.md) hold the rules. Working code is half of the question; the other half is whether the change is the smallest correct one.

## Scope

Read what changed: the diff against the base and what it was meant to do. Then follow the changed code to the user actions that reach it. That set is what the review verifies; workflows the change cannot reach need no check. A sidebar layout change does not call for export tests.

## Verify

`bun run check`, `bun run build`, and `bun run test` are fast; run them for any code change. Beyond that, pick the cheapest check that would catch a regression in the scope:

| Change | Check |
| --- | --- |
| Documentation | Links and the references it describes. |
| Layout, styling, copy | Look at the affected screens at the widths they change. |
| Document, edits, history, loaders | The Bun tests covering them. |
| Processing, shaders, rendering | The browser tests of that feature, e.g. `bun run test:browser tests/vignette.e2e.ts`; before/after measurements when GPU work changes ([PERFORMANCE.md](PERFORMANCE.md)). |
| Shared primitives in `core/` or `components/` | The browser tests of the workflows that use them. |

Run the whole browser suite only when a change cuts across the editor. A failure that also happens on the base is not the change's; report it as a gap.

## Screenshots

New features and substantial UI or design changes show the affected interface in the PR description: before and after for changed UI, the new states for new UI, with the same fixture and viewport on both sides. For a smaller visible change, ask whether screenshots are wanted. Upload images to GitHub as PR attachments; never commit them.

Use [GitHub CLI attachments](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli) with `gh` 2.99.0 or newer. It uses the existing CLI authentication and requires repository push access; no browser session is needed. Run `gh` outside the sandbox for network access. Reference the local files in the Markdown body, then attach the same paths:

```sh
gh pr edit 123 --body-file /tmp/pr-body.md \
  --attach /tmp/before.png --attach /tmp/after.png
```

The CLI replaces matching local Markdown paths with uploaded GitHub URLs. `--attach` also works with `gh pr create` and `gh pr comment`; without a matching reference it appends the image. Check the published body after uploading. A partial upload can update the PR and still return a nonzero exit code, so inspect what succeeded before retrying. Keep each image under 10 MB.

## Read the diff

Before judging the lines, work out how the request could be solved with what the code already has, then compare that with the change.

- **Size:** Does each added module, option, branch, and test come from the request? Could the change extend an existing model or primitive instead of adding one beside it? Flag abstractions with one caller and code for cases nothing reaches.
- **Root cause:** Is the fix where the problem starts, rather than an adapter, conversion, or special case around a model? Does it repeat something that exists, such as a second brush or loader, where one shared primitive would be less code? When the right fix is larger than the request, name it.
- **Ownership:** Does each module keep one responsibility and stay in its layer? Does feature behavior stay in its feature? Do edits, processing, and rendering run without React?
- **State:** Is each fact stored once and behavior driven by it rather than by DOM structure or timing? Is external input validated at its boundary?
- **Performance:** Does pixel work run on the GPU, without readbacks the result does not need? Does work follow what changed rather than repeat on every render or pointer event?
- **Lifetime:** Do edits, grouping, cancellation, and undo work together? Can async work outlive its document? Is every resource and subscription released?
- **Tests:** Would a user workflow test fail if the change broke, and is it the smallest test that would? Flag tests that protect no workflow or regression.
- **Architecture:** If the structure changed, was it agreed and is [ARCHITECTURE.md](ARCHITECTURE.md) updated?

## Report

For each finding, name the code, the concrete problem, and the smallest fix; separate required changes from optional ones. A simpler implementation that removes code without losing behavior is required. List the checks run and any gaps.
