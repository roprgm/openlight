<!-- Include evidence when opening the PR. Keep the description brief and direct;
use PR/CI attachments for generated evidence instead of committing it. Omit work logs. -->

## Change

<!-- Describe the problem and resulting behavior in one or two sentences.
Add only the implementation details or tradeoffs needed to review the change. -->

## Validation

<!-- Report the required checks from AGENTS.md and any verification gaps. -->

## Visual evidence

<!-- UI additions or changes: embed actual screenshots with the affected controls
visible in context for visual approval. Show before/after for existing UI changes
and representative states for new UI. Rendered output alone is insufficient.
Rendering changes: also show before/after output side by side, using the same
fixture and matching conditions; name the settings and state what varies.
Include quality metrics for a concrete quality claim or regression;
state units and limits. Keep image-quality results separate from timings.
Nonvisual code changes: show the exercised workflow. Verify that image links
are accessible from this description. Documentation-only changes may mark
this section not applicable. -->

## Rendering performance

<!-- Use a compact results table following PERFORMANCE.md: reproducible base/head
comparison, workload and environment, timing scope, sample counts, median/p95,
and a short interpretation. Include the reproduction command; link extra samples when useful.
Separate neutral/bypass overhead from the cost of new active behavior.
If rendering work is unaffected, explain why. Report missing evidence explicitly. -->
